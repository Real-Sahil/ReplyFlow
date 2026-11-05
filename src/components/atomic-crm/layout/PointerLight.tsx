import { useEffect } from "react";

import { REST_LIGHT, ease, pointToLight, tiltToLight } from "./light";

// Gives the glass a light to catch. It sets --lx and --ly on the page (the light's direction, -1 to 1), which
// the glass and the colour behind it read, and, for a mouse or pen over a glass surface, --gx and --gy on that
// surface (where the pointer is on it), so a soft spotlight follows the pointer across it. On a phone the
// light follows the tilt where the browser allows it without asking. The light glides with a little inertia and
// does no work at all once it has settled. It does nothing for anyone who asks their device for less motion.
export const PointerLight = () => {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let target = { ...REST_LIGHT };
    let current = { ...REST_LIGHT };
    let lightFrame = 0;
    let spotFrame = 0;
    let spot: { el: HTMLElement; x: number; y: number } | null = null;

    const paint = () => {
      root.style.setProperty("--lx", current.x.toFixed(3));
      root.style.setProperty("--ly", current.y.toFixed(3));
    };
    const glide = () => {
      const x = ease(current.x, target.x);
      const y = ease(current.y, target.y);
      current = { x: x.value, y: y.value };
      paint();
      lightFrame = x.settled && y.settled ? 0 : requestAnimationFrame(glide);
    };
    const aim = (light: { x: number; y: number }) => {
      target = light;
      if (!lightFrame) lightFrame = requestAnimationFrame(glide);
    };

    const onMove = (event: PointerEvent) => {
      aim(pointToLight(event.clientX, event.clientY, innerWidth, innerHeight));
      if (event.pointerType === "touch") return;
      const glass = (event.target as Element | null)?.closest?.<HTMLElement>(
        ".glass",
      );
      if (!glass) return;
      const box = glass.getBoundingClientRect();
      spot = {
        el: glass,
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      };
      if (!spotFrame) {
        spotFrame = requestAnimationFrame(() => {
          spotFrame = 0;
          if (!spot) return;
          spot.el.style.setProperty("--gx", `${spot.x.toFixed(0)}px`);
          spot.el.style.setProperty("--gy", `${spot.y.toFixed(0)}px`);
        });
      }
    };
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      aim(tiltToLight(event.gamma, event.beta));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    // iOS asks for permission to read the tilt; we never prompt for it, so it is only used where it is open.
    const needsPermission =
      typeof (
        DeviceOrientationEvent as unknown as { requestPermission?: unknown }
      ).requestPermission === "function";
    if (!needsPermission && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }
    paint();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
      cancelAnimationFrame(lightFrame);
      cancelAnimationFrame(spotFrame);
    };
  }, []);
  return null;
};
