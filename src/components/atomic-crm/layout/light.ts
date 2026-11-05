// The light behind the glass. A point on the screen (or the tilt of the phone) becomes a direction from -1 to 1
// on each axis; the glass reads it to move its highlight and the colour behind it shifts a few pixels the
// other way. Kept apart from the component so the arithmetic can be tested.

export type Light = { x: number; y: number };

// Where the light sits when nothing has moved it: above and a little to the left, as the glass was drawn.
export const REST_LIGHT: Light = { x: -0.5, y: -1 };

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

// A pointer at (x, y) on a screen w by h: the left edge is -1, the right edge 1, and the same for top and bottom.
export const pointToLight = (
  x: number,
  y: number,
  w: number,
  h: number,
): Light => ({
  x: clamp((x / Math.max(w, 1)) * 2 - 1),
  y: clamp((y / Math.max(h, 1)) * 2 - 1),
});

// A phone's tilt in degrees: gamma is left and right, beta is forward and back (about 45 held in the hand).
// A quarter turn each way is as far as the light goes, and it is eased so a small tilt is a small move.
export const tiltToLight = (gamma: number, beta: number): Light => ({
  x: clamp(gamma / 40) * 0.9,
  y: clamp((beta - 45) / 40) * 0.9,
});

// One step of easing towards a target, so the light glides instead of jumping. Returns the new value and
// whether it is close enough to stop.
export const ease = (current: number, target: number, rate = 0.12) => {
  const next = current + (target - current) * rate;
  return { value: next, settled: Math.abs(target - next) < 0.002 };
};
