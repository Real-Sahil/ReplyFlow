// Keeps a device on the newest build. A tab that stays open, or a phone that restores a tab from
// memory, can keep running an old copy of the app for days. This notices (the build publishes
// version.json), clears what the browser stored, and reloads. It never reloads while someone is typing.

const current = () =>
  typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;

const GUARD = "replyflow.updatedTo";

// Forget the service worker and every stored copy, then load the page fresh from the network.
export const hardReload = async () => {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).map((r) => r.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Reloading is still worth doing.
  }
  window.location.reload();
};

// A screen's code could not be fetched: the page is from an older build than the server.
export const isChunkError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically/i.test(
    message,
  );
};

const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
  );
};

let lastCheck = 0;

const check = async () => {
  if (!import.meta.env.PROD || current() === "dev") return;
  // Several things can ask at once (opening the tab, coming online, moving between screens).
  if (Date.now() - lastCheck < 20_000) return;
  lastCheck = Date.now();
  try {
    const response = await fetch(
      new URL(`version.json?t=${Date.now()}`, document.baseURI),
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const { version } = (await response.json()) as { version?: string };
    if (!version || version === current()) return;
    // One attempt per version, so a problem on the server can never cause a loop.
    if (sessionStorage.getItem(GUARD) === version) return;
    sessionStorage.setItem(GUARD, version);
    if (typing()) {
      document.addEventListener("focusout", () => void hardReload(), {
        once: true,
      });
      return;
    }
    await hardReload();
  } catch {
    // Offline, or a blocked request: try again next time.
  }
};

// A new build reaches every open app within a minute, and at once when someone comes back to it.
export const startUpdateCheck = () => {
  window.setTimeout(() => void check(), 3000);
  window.setInterval(() => void check(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  // A page restored from memory, a phone reconnecting, and a move to another screen.
  window.addEventListener("pageshow", () => void check());
  window.addEventListener("online", () => void check());
  window.addEventListener("focus", () => void check());
  window.addEventListener("hashchange", () => void check());
};
