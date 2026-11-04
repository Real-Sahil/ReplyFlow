import { useEffect, useMemo, useState } from "react";
import { useStore } from "ra-core";

import {
  ThemeProviderContext,
  type GlassLevel,
  type Theme,
} from "./theme-context";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const DARK_QUERY = "(prefers-color-scheme: dark)";
const LESS_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";
// The colour browsers use for their own chrome (address bar, installed-app title bar).
const BROWSER_COLOUR = { light: "#f6f3f1", dark: "#171211" } as const;

const matches = (query: string) =>
  typeof window !== "undefined" && !!window.matchMedia?.(query).matches;

/**
 * Theme provider: light, dark or follow the device, plus how much glass the navigation uses.
 * Both choices are saved per browser. Someone who has not chosen a glass level and whose device
 * asks for reduced transparency gets the solid look.
 *
 * @internal
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useStore<Theme>(storageKey, defaultTheme);
  const [glass, setGlass] = useStore<GlassLevel>(
    "glass",
    matches(LESS_TRANSPARENCY_QUERY) ? "off" : "regular",
  );
  const [systemDark, setSystemDark] = useState(() => matches(DARK_QUERY));

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light";

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", BROWSER_COLOUR[resolvedTheme]);
  }, [resolvedTheme]);

  useEffect(() => {
    window.document.documentElement.setAttribute("data-glass", glass);
  }, [glass]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, glass, setGlass }),
    [theme, resolvedTheme, setTheme, glass, setGlass],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
