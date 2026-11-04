// Directional screen transitions. When the address changes, the browser keeps the old screen,
// slides the new one in from the right (going deeper) or the old one out to the right (going back),
// and glides sideways between the main sections. It is built on the browser's View Transitions, so
// the old and new screens animate on the compositor. Where that is not available, or when someone
// asks for less motion, nothing changes: the screen just appears, as before.
//
// How it hooks in: the router navigates with history.pushState and listens for popstate. Wrapping
// pushState and listening to popstate first lets us start the transition while the old screen is still
// on the page, then finish it once the new screen has rendered (see ScreenReady).

type Direction = "forward" | "back" | "tab-forward" | "tab-back";

// The sections people switch between with the bar or the tabs, in the order they appear.
const SECTIONS = [
  "",
  "messenger_inbox",
  "contacts",
  "deals",
  "orders",
  "page_posts",
  "products",
];
// A safety net: if the new screen never reports in, the transition still ends.
const MAX_WAIT_MS = 300;

let release: (() => void) | null = null;
let installed = false;

const pathOf = (hash: string) =>
  hash.replace(/^#\/?/, "").split("?")[0].replace(/\/+$/, "");
const sectionOf = (path: string) => path.split("/")[0];

const direction = (fromPath: string, toPath: string): Direction => {
  const from = SECTIONS.indexOf(sectionOf(fromPath));
  const to = SECTIONS.indexOf(sectionOf(toPath));
  const topLevel = (p: string) => p.split("/").filter(Boolean).length <= 1;
  if (from >= 0 && to >= 0 && from !== to && topLevel(fromPath) && topLevel(toPath)) {
    return to > from ? "tab-forward" : "tab-back";
  }
  return "forward";
};

const wantsMotion = () =>
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const run = (dir: Direction, change?: () => void) => {
  const root = document.documentElement;
  root.dataset.nav = dir;
  const transition = document.startViewTransition(() => {
    change?.();
    return new Promise<void>((resolve) => {
      release = resolve;
      window.setTimeout(resolve, MAX_WAIT_MS);
    });
  });
  transition.finished.finally(() => {
    delete root.dataset.nav;
  });
};

// Called by the layouts once the new screen is in the page. The slide starts right away: a screen
// that is still loading data or code slides in showing its placeholder and fills in as it arrives,
// which is how a native app behaves. Holding the old screen still until the new one was ready made
// every tap feel late.
export const screenReady = () => {
  if (!release) return;
  requestAnimationFrame(() => {
    const done = release;
    release = null;
    done?.();
  });
};

export const installScreenTransitions = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if (typeof document.startViewTransition !== "function") return;

  let index: number = window.history.state?.idx ?? 0;

  const originalPush = window.history.pushState.bind(window.history);
  window.history.pushState = (state, unused, url) => {
    if (!wantsMotion() || url == null) return originalPush(state, unused, url);
    const toPath = pathOf(new URL(String(url), window.location.href).hash);
    const fromPath = pathOf(window.location.hash);
    index = (state as { idx?: number } | null)?.idx ?? index + 1;
    // Only the search part changing (a filter, a page number) is not a new screen.
    if (toPath === fromPath) return originalPush(state, unused, url);
    run(direction(fromPath, toPath), () => originalPush(state, unused, url));
  };

  // Back and forward buttons. The browser captures the old screen on the next frame, but the router
  // would redraw straight away, so the old screen would already be the new one. This listener runs
  // first and holds the event back; the router gets it again, replayed, once the old screen has been
  // captured.
  let replaying = false;
  window.addEventListener(
    "popstate",
    (event) => {
      if (replaying || !wantsMotion()) return;
      const state = event.state as { idx?: number } | null;
      const next: number = state?.idx ?? index;
      const dir: Direction = next < index ? "back" : "forward";
      index = next;
      event.stopImmediatePropagation();
      run(dir, () => {
        replaying = true;
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
        replaying = false;
      });
    },
    true,
  );
};
