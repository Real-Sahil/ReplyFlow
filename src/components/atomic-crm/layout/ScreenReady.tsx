import { useLayoutEffect } from "react";
import { useLocation } from "react-router";

import { screenReady } from "@/lib/screenTransitions";

// Tells the screen transition that the new screen is in the page, so it can finish animating.
export const ScreenReady = () => {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    screenReady();
  }, [pathname]);
  return null;
};
