import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installErrorReporting } from "./lib/errorReporting";
import { installScreenTransitions } from "./lib/screenTransitions";

installErrorReporting();
installScreenTransitions();

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

// When a new version of the app takes over, show it without asking people to refresh by hand.
// The first install is not an update, so it never reloads. If someone is typing, the reload
// waits until they leave the tab, so a half-written message is never lost.
if ("serviceWorker" in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const typing =
      !!active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);
    if (!typing) {
      window.location.reload();
      return;
    }
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") window.location.reload();
      },
      { once: true },
    );
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
