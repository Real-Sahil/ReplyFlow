import { useEffect } from "react";

// Puts a number on the app icon (Dock, taskbar, home screen) when the app is
// installed. Browsers and platforms without the Badging API ignore it.
export const useAppBadge = (count: number) => {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    const run = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.();
    run?.catch(() => {});
  }, [count]);
};
