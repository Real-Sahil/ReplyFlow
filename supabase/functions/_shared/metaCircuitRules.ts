// Meta error 368 means the Page or app has been blocked for an action it took.
// Retrying makes it worse, so every Meta call stops until an administrator has
// checked the Page in Meta and cleared the block. Nothing clears it automatically.
export const ACTION_BLOCK_CODE = 368;

export const isActionBlock = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return Number(code) === ACTION_BLOCK_CODE;
};

// Reads a Graph API error body and says whether it is an action block.
export const actionBlockFrom = (body: unknown): boolean =>
  isActionBlock((body as { error?: unknown } | null)?.error);

export type CircuitState = {
  blocked: boolean;
  reason: string | null;
  blocked_at: string | null;
};

export const blockMessage =
  "Facebook has blocked actions from this Page for now. Nothing is being sent until an administrator clears the block in Facebook connection.";
