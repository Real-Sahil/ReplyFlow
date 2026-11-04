import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router";

import { screenReady } from "@/lib/screenTransitions";

import { preloadCommonScreens } from "../root/lazyScreen";

// Tells the screen transition that the new screen is in the page, so it can finish animating.
export const ScreenReady = () => {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    screenReady();
  }, [pathname]);
  useEffect(() => {
    preloadCommonScreens();
  }, []);
  return null;
};
