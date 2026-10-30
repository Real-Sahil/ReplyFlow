// Sends unexpected browser errors to the error log, so an administrator can see them in the
// app. Production only, signed-in users only (the function rejects anyone else), and capped
// per visit so a loop cannot flood the log.
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

const MAX_REPORTS_PER_VISIT = 10;
// Browsers raise these for harmless reasons, and nobody can act on them.
const IGNORED = [/ResizeObserver loop/i, /Script error\.?$/i];

const seen = new Set<string>();

export const reportError = (error: unknown) => {
  if (!import.meta.env.PROD) return;
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (IGNORED.some((pattern) => pattern.test(message))) return;
  if (seen.has(message) || seen.size >= MAX_REPORTS_PER_VISIT) return;
  seen.add(message);

  void getSupabaseClient()
    .functions.invoke("log_client_error", {
      method: "POST",
      body: {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        page: window.location.hash || window.location.pathname,
      },
    })
    .catch(() => {
      // Reporting must never cause a second error.
    });
};

export const installErrorReporting = () => {
  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
};
