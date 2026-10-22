// Receives Messenger webhooks for the business Page (official Messenger Platform).
// Secrets (set in the Supabase dashboard, never in the repo):
//   META_APP_SECRET        app secret, used to verify every delivery's signature
//   META_VERIFY_TOKEN      any long random string, also entered in Meta's webhook setup
//   META_PAGE_ID           optional: ignore events for any other Page
//   META_PAGE_ACCESS_TOKEN optional: lets us look up the customer's name

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  type AutoReplySettings,
  type ConversationState,
  decideAutoReply,
  emptyState,
} from "./autoReply.ts";
import {
  isValidSignature,
  parseInboundMessages,
  parseInboxEchoes,
  parsePageComments,
} from "./webhook.ts";
import type { InboundMessage } from "./webhook.ts";

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

const fetchProfile = async (psid: string) => {
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!token) return {};
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(psid)}?fields=first_name,last_name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      // Usually a token or permission problem; visible in the function logs.
      console.error(
        "Profile lookup failed",
        response.status,
        (await response.text()).slice(0, 300),
      );
      return {};
    }
    const profile = await response.json();
    return {
      first: profile.first_name as string | undefined,
      last: profile.last_name as string | undefined,
    };
  } catch {
    return {};
  }
};

const sendText = async (token: string, psid: string, text: string) => {
  const response = await fetch("https://graph.facebook.com/v21.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text },
    }),
    signal: AbortSignal.timeout(5000),
  });
  const meta = await response.json().catch(() => ({}));
  if (!response.ok || !meta.message_id) {
    throw new Error(`Send API ${response.status} ${meta?.error?.code ?? ""}`);
  }
  return meta.message_id as string;
};

// Greeting, away message and quick questions, as configured by an admin. Any
// failure here is logged and swallowed: the customer's message is already saved,
// and answering Meta with an error would only make it redeliver.
const runAutoReply = async (message: InboundMessage, messageRowId: number) => {
  try {
    const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
    if (!token) return;
    const { data: settings } = await supabaseAdmin
      .from("messenger_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!settings?.auto_replies_enabled) return;

    const { data: row } = await supabaseAdmin
      .from("messenger_messages")
      .select("contact_id, deal_id")
      .eq("id", messageRowId)
      .single();
    if (!row?.contact_id) return;
    const contactId = row.contact_id as number;

    const { data: existing } = await supabaseAdmin
      .from("messenger_conversation_state")
      .select("step, greeted_at, away_sent_at, done, handoff, answers")
      .eq("contact_id", contactId)
      .maybeSingle();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: staffReplies } = await supabaseAdmin
      .from("messenger_messages")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .or("sent_by.not.is.null,source.eq.page_inbox")
      .gt("sent_at", since);

    const result = decideAutoReply({
      settings: settings as AutoReplySettings,
      state: (existing as ConversationState | null) ?? emptyState(),
      text: message.body,
      now: new Date(),
      humanActive: (staffReplies ?? 0) > 0,
    });

    // Save progress first, so a crash while sending never repeats a question.
    await supabaseAdmin.from("messenger_conversation_state").upsert({
      contact_id: contactId,
      ...result.state,
      updated_at: new Date().toISOString(),
    });

    for (const text of result.send) {
      const messageId = await sendText(token, message.psid, text);
      await supabaseAdmin.from("messenger_messages").insert({
        mid: messageId,
        page_id: message.pageId,
        psid: message.psid,
        contact_id: contactId,
        deal_id: row.deal_id,
        body: text,
        direction: "outbound",
      });
    }

    if (result.finishedAnswers && row.deal_id) {
      await supabaseAdmin.from("deal_notes").insert({
        deal_id: row.deal_id,
        text:
          "Quick questions answered on Messenger:\n" +
          result.finishedAnswers
            .map((a) => `${a.question} ${a.answer}`)
            .join("\n"),
      });
    }
    if (result.handoffRequested) {
      await supabaseAdmin.from("tasks").insert({
        contact_id: contactId,
        deal_id: row.deal_id,
        text: "Customer asked for a person on Messenger: reply to them",
        due_date: new Date().toISOString(),
        source: "auto",
        dedupe_key: `handoff:${contactId}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  } catch (error) {
    console.error("Auto-reply failed", (error as Error).message);
  }
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (
      verifyToken &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === verifyToken
    ) {
      return text(url.searchParams.get("hub.challenge") ?? "");
    }
    return text("Forbidden", 403);
  }

  if (req.method !== "POST") return text("Method not allowed", 405);

  const rawBody = await req.text();
  const valid = await isValidSignature(
    Deno.env.get("META_APP_SECRET") ?? "",
    rawBody,
    req.headers.get("x-hub-signature-256"),
  );
  if (!valid) return text("Invalid signature", 403);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return text("Bad request", 400);
  }

  const messages = parseInboundMessages(
    payload,
    Deno.env.get("META_PAGE_ID") || undefined,
  );

  for (const echo of parseInboxEchoes(
    payload,
    Deno.env.get("META_PAGE_ID") || undefined,
  )) {
    const { error } = await supabaseAdmin.rpc("record_messenger_echo", {
      p_page_id: echo.pageId,
      p_psid: echo.psid,
      p_mid: echo.mid,
      p_body: echo.body,
      p_sent_at: echo.sentAt,
    });
    if (error) console.error("record_messenger_echo failed", error.message);
  }

  for (const comment of parsePageComments(
    payload,
    Deno.env.get("META_PAGE_ID") || undefined,
  )) {
    const { error } = await supabaseAdmin.rpc("record_page_comment", {
      p_comment_id: comment.commentId,
      p_post_id: comment.postId,
      p_parent_id: comment.parentId,
      p_page_id: comment.pageId,
      p_author_id: comment.authorId,
      p_author_name: comment.authorName,
      p_body: comment.body,
      p_commented_at: comment.createdAt,
    });
    if (error) console.error("record_page_comment failed", error.message);
  }

  for (const message of messages) {
    const profile = await fetchProfile(message.psid);
    const { data: rowId, error } = await supabaseAdmin.rpc(
      "record_messenger_message",
      {
        p_page_id: message.pageId,
        p_psid: message.psid,
        p_mid: message.mid,
        p_body: message.body,
        p_sent_at: message.sentAt,
        p_first_name: profile.first ?? null,
        p_last_name: profile.last ?? null,
        p_referral: message.referral,
      },
    );
    if (error) {
      console.error("record_messenger_message failed", error.message);
      // A non-200 makes Meta retry the delivery later.
      return text("Error", 500);
    }
    // null means Meta redelivered a message we already stored: do not answer twice.
    if (rowId) await runAutoReply(message, rowId as number);
  }

  return text("EVENT_RECEIVED");
});
