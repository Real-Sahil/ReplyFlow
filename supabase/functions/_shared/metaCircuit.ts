import { supabaseAdmin } from "./supabaseAdmin.ts";
import {
  actionBlockFrom,
  blockMessage,
  type CircuitState,
} from "./metaCircuitRules.ts";

export class MetaBlockedError extends Error {
  constructor() {
    super(blockMessage);
  }
}

export const circuitState = async (): Promise<CircuitState> => {
  const { data } = await supabaseAdmin
    .from("meta_circuit")
    .select("blocked, reason, blocked_at")
    .eq("id", 1)
    .maybeSingle();
  return {
    blocked: !!data?.blocked,
    reason: (data?.reason as string | null) ?? null,
    blocked_at: (data?.blocked_at as string | null) ?? null,
  };
};

// Call before every Graph request. Throws while the block is in place, so no
// request is sent.
export const assertMetaOpen = async () => {
  if ((await circuitState()).blocked) throw new MetaBlockedError();
};

// Call with the body of any failed Graph response. Records the block when Meta
// reports an action block, so every feature stops at once.
export const recordIfActionBlock = async (body: unknown) => {
  if (!actionBlockFrom(body)) return false;
  const message =
    (body as { error?: { message?: string } })?.error?.message ??
    "Action block";
  await supabaseAdmin
    .from("meta_circuit")
    .update({
      blocked: true,
      reason: message.slice(0, 300),
      blocked_at: new Date().toISOString(),
    })
    .eq("id", 1);
  return true;
};
