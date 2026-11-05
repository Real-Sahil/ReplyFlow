import { createContext } from "react";

export type Theme = "dark" | "light" | "system";
// How much glass the navigation layer uses. "off" is the plain, solid look.
export type GlassLevel = "regular" | "rich" | "off";
// The slow constellation behind the app. "off" leaves the still glow.
export type Motion = "on" | "off";

export type ThemeProviderState = {
  /** The person's choice, which may be "system". */
  theme: Theme;
  /** What is actually shown: always "light" or "dark". */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  glass: GlassLevel;
  setGlass: (glass: GlassLevel) => void;
  motion: Motion;
  setMotion: (motion: Motion) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
  glass: "regular",
  setGlass: () => null,
  motion: "on",
  setMotion: () => null,
};

export const ThemeProviderContext =
  createContext<ThemeProviderState>(initialState);
