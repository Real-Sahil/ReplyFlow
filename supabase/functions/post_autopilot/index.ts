// Writes Facebook Page posts with Groq (free tier) and queues them for review.
//   action "run":     called every 30 minutes by pg_cron with the x-autopilot-key
//                     header. Drafts a post for up to a few products that have no
//                     post yet, in the next free slots, and leaves them pending review.
//   action "suggest": called by a signed-in administrator or agent from the post
//                     composer. Returns a caption for one product. Saves nothing.
// Secrets (Supabase Edge Function secrets, never in the repo):
//   GROQ_API_KEY     from console.groq.com
//   GROQ_MODEL       optional, defaults to llama-3.3-70b-versatile
// The cron key is in Vault (autopilot_key), checked by post_autopilot_key_ok().

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  buildUserPrompt,
  checkDraft,
  nextFreeSlots,
  parseDraft,
  type ProductFacts,
  SYSTEM_PROMPT,
  validSlotTimes,
} from "./autopilotRules.ts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
// Keeps one run well inside the free tier, even if the schedule misfires.
const MAX_PER_RUN = 3;

const PRODUCT_FIELDS =
  "id, title, collection, product_type, colour, price_pence, original_price_pence, source_url, image_url";

// The model's answer was unusable for this product: skip the product, keep going.
class DraftRejected extends Error {}
// Groq itself failed (quota, outage, bad key): stop the run rather than hammer it.
class GroqError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
class NotConfigured extends Error {}

const modelName = () => Deno.env.get("GROQ_MODEL") || DEFAULT_MODEL;

const groqChat = async (product: ProductFacts): Promise<string> => {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new NotConfigured("The AI writer is not set up yet.");

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        temperature: 0.6,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(product) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GroqError(502, "Could not reach the AI writer.");
  }
  if (!response.ok) {
    console.error("Groq error", response.status);
    throw new GroqError(
      response.status,
      "The AI writer is unavailable right now.",
    );
  }
  const json = await response.json().catch(() => ({}));
  return (json?.choices?.[0]?.message?.content as string | undefined) ?? "";
};

// One caption for one product, checked before anyone sees it.
const draftFor = async (product: ProductFacts): Promise<string> => {
  const message = parseDraft(await groqChat(product));
  if (!message) {
    throw new DraftRejected("The AI writer did not return a usable caption.");
  }
  const check = checkDraft(message, product);
  if (!check.ok) throw new DraftRejected(check.reason);
  return message;
};

const loadSettings = async () => {
  const { data } = await supabaseAdmin
    .from("post_autopilot_settings")
    .select("enabled, posts_per_day, slot_times, timezone")
    .eq("id", 1)
    .maybeSingle();
  return data;
};

// Active products with a photo that no post has used yet, newest first.
const candidateProducts = async (limit: number): Promise<ProductFacts[]> => {
  const { data: products } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("active", true)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const { data: used } = await supabaseAdmin
    .from("page_posts")
    .select("product_id")
    .not("product_id", "is", null);
  const usedIds = new Set((used ?? []).map((row) => row.product_id as number));
  return (
    (products ?? []) as Array<ProductFacts & { id: number; image_url: string }>
  )
    .filter((product) => !usedIds.has(product.id))
    .slice(0, limit);
};

// Times already planned from now on, so new posts do not crowd them.
const plannedTimes = async (): Promise<Date[]> => {
  const { data } = await supabaseAdmin
    .from("page_posts")
    .select("scheduled_for")
    .in("status", ["draft", "pending_review", "approved", "scheduled"])
    .gte("scheduled_for", new Date().toISOString());
  return (data ?? [])
    .map((row) => Date.parse(row.scheduled_for as string))
    .filter((t) => !Number.isNaN(t))
    .map((t) => new Date(t));
};

const runAutopilot = async () => {
  const settings = await loadSettings();
  if (!settings?.enabled) return { skipped: "turned off" };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: madeToday } = await supabaseAdmin
    .from("page_posts")
    .select("id", { count: "exact", head: true })
    .eq("source", "ai")
    .gte("created_at", since);
  const room = Math.min(
    MAX_PER_RUN,
    (settings.posts_per_day ?? 0) - (madeToday ?? 0),
  );
  if (room <= 0) return { skipped: "daily limit reached" };

  const products = await candidateProducts(room);
  if (products.length === 0)
    return { created: 0, note: "nothing new to write about" };

  const slots = nextFreeSlots({
    now: new Date(),
    slotTimes: validSlotTimes(settings.slot_times),
    taken: await plannedTimes(),
    count: products.length,
    timeZone: settings.timezone ?? "Europe/London",
  });
  if (slots.length === 0) return { skipped: "no free slots configured" };

  const skipped: string[] = [];
  let created = 0;
  for (const [index, product] of products.entries()) {
    const slot = slots[index];
    if (!slot) break;
    try {
      const message = await draftFor(product);
      const { error } = await supabaseAdmin.from("page_posts").insert({
        message,
        product_id: product.id,
        image_url: product.image_url,
        link_url: product.source_url,
        status: "pending_review",
        scheduled_for: slot.toISOString(),
        submitted_at: new Date().toISOString(),
        source: "ai",
        ai_model: modelName(),
      });
      if (error) throw new Error(error.message);
      created++;
    } catch (error) {
      if (error instanceof GroqError || error instanceof NotConfigured) {
        skipped.push((error as Error).message);
        break;
      }
      skipped.push(`product ${product.id}: ${(error as Error).message}`);
    }
  }
  return { created, skipped };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// The cron job sends the key held in Vault; the database checks it.
const cronCall = async (req: Request) => {
  const given = req.headers.get("x-autopilot-key");
  if (!given) return false;
  const { data } = await supabaseAdmin.rpc("post_autopilot_key_ok", {
    candidate: given,
  });
  return data === true;
};

// The "Write with AI" button: one caption for one product, for a signed-in user.
const suggest = async (
  req: Request,
  user: Parameters<typeof getUserSale>[0],
) => {
  const sale = await getUserSale(user);
  if (!sale || sale.disabled || sale.role === "viewer") {
    return createErrorResponse(403, "Not allowed to write posts");
  }

  let input: { product_id?: unknown };
  try {
    input = await req.json();
  } catch {
    return createErrorResponse(400, "Invalid request");
  }
  if (!Number.isInteger(input.product_id)) {
    return createErrorResponse(400, "A product is required");
  }

  const { data: product } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", input.product_id)
    .maybeSingle();
  if (!product) return createErrorResponse(404, "Product not found");

  try {
    return json({ data: { message: await draftFor(product as ProductFacts) } });
  } catch (error) {
    if (error instanceof NotConfigured) {
      return createErrorResponse(503, (error as Error).message, {
        code: "not_configured",
      });
    }
    if (error instanceof DraftRejected) {
      return createErrorResponse(422, (error as Error).message, {
        code: "draft_rejected",
      });
    }
    if (error instanceof GroqError) {
      return createErrorResponse(502, (error as Error).message, {
        code: "ai_unavailable",
      });
    }
    throw error;
  }
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    if (await cronCall(req)) {
      try {
        return json({ data: await runAutopilot() });
      } catch (error) {
        console.error("Autopilot run failed", (error as Error).message);
        return createErrorResponse(500, "The autopilot run failed");
      }
    }

    return AuthMiddleware(req, (req) =>
      UserMiddleware(req, (req, user) => suggest(req, user!)),
    );
  }),
);
