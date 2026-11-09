import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  planDestinations,
  platformOf,
  valuesFor,
  type Action,
  type DestinationRow,
  type Wording,
} from "./destinations";

// Makes the saved destinations of a post match what the person ticked and the wording chosen: adds the new ones,
// removes the un-ticked ones that have not been sent, and updates the rest (words, and whether they wait for a
// time). Something already posted is left alone.
export const syncDestinations = async (args: {
  postId: number;
  existing: DestinationRow[];
  wanted: Set<string>;
  wording: Wording;
  action: Action;
  whenIso: string | null;
}) => {
  const { postId, existing, wanted, wording, action, whenIso } = args;
  const client = getSupabaseClient();
  const plan = planDestinations(existing, wanted);

  for (const row of plan.remove) {
    const { error } = await client
      .from("post_destinations")
      .delete()
      .eq("id", row.id);
    if (error) throw error;
  }
  if (plan.add.length) {
    const { error } = await client.from("post_destinations").insert(
      plan.add.map((channel_key) => ({
        post_id: postId,
        channel_key,
        ...valuesFor(channel_key, action, whenIso, wording),
      })),
    );
    if (error) throw error;
  }
  for (const row of plan.keep) {
    const { error } = await client
      .from("post_destinations")
      .update(valuesFor(row.channel_key, action, whenIso, wording))
      .eq("id", row.id);
    if (error) throw error;
  }
};

export type SendResult = { ok: boolean; text: string };

// Sends one post to one destination now, or takes it down, through the server (which holds the tokens).
export const sendDestination = async (
  postId: number,
  channelKey: string,
  action: "publish" | "remove",
): Promise<SendResult> => {
  if (platformOf(channelKey) === "facebook") {
    return sendFacebook(
      postId,
      channelKey.replace("facebook:page:", ""),
      action,
    );
  }
  const { data, error } = await getSupabaseClient().functions.invoke<{
    data: { photo?: string };
  }>("destination_publish", {
    method: "POST",
    body: { id: postId, channel_key: channelKey, action },
  });
  if (error) {
    const body = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string }
      | undefined;
    return { ok: false, text: body?.message ?? "Could not reach LinkedIn" };
  }
  if (action === "remove") return { ok: true, text: "Taken down" };
  const photo = data?.data?.photo;
  return {
    ok: true,
    text:
      photo === "sent"
        ? "Posted with its photo"
        : photo === "skipped"
          ? "Posted as text only (its photo could not be sent)"
          : "Posted",
  };
};

const REMEMBER = "replyflow.destinations";

export const rememberedChoice = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((k) => typeof k === "string")
      : [];
  } catch {
    return [];
  }
};
export const rememberChoice = (keys: Set<string>) => {
  try {
    localStorage.setItem(REMEMBER, JSON.stringify([...keys]));
  } catch {
    // not remembered, still works
  }
};

// Posts the post to one Facebook Page now, or takes it down from there, through the server (which holds the Page
// tokens). Facebook's own schedule is set from the editor, for every Page at once.
export const sendFacebook = async (
  postId: number,
  pageId: string,
  action: "publish" | "remove",
): Promise<SendResult> => {
  const { error } = await getSupabaseClient().functions.invoke("post_publish", {
    method: "POST",
    body: { id: postId, action, page_id: pageId },
  });
  if (error) {
    const body = (await error.context?.json?.().catch(() => ({}))) as
      | { message?: string }
      | undefined;
    return { ok: false, text: body?.message ?? "Could not reach Facebook" };
  }
  return { ok: true, text: action === "publish" ? "Posted" : "Taken down" };
};
