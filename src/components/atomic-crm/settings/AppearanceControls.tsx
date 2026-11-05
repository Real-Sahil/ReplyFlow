import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/admin/use-theme";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";

// Light, dark or follow the device, and how much glass the navigation uses. Saved per browser.
export const AppearanceControls = () => {
  const { theme, setTheme, glass, setGlass, motion, setMotion } = useTheme();
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Appearance</span>
        <Segmented
          label="Appearance"
          value={theme}
          onChange={setTheme}
          options={[
            ["light", "Light"],
            ["system", "Auto"],
            ["dark", "Dark"],
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Glass</span>
        <Segmented
          label="Glass"
          value={glass}
          onChange={setGlass}
          options={[
            ["regular", "Regular"],
            ["rich", "Rich"],
            ["off", "Off"],
          ]}
        />
        <span className="text-xs text-muted-foreground">
          Glass is the frosted look of the menus and bars. Off gives plain
          surfaces and is easier on older phones.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Background motion</span>
        <Segmented
          label="Background motion"
          value={motion}
          onChange={setMotion}
          options={[
            ["on", "On"],
            ["off", "Off"],
          ]}
        />
        <span className="text-xs text-muted-foreground">
          A slow drift of connected points behind the app. Off keeps the still
          glow and saves battery. It starts off if your device asks for less
          motion.
        </span>
      </div>
    </div>
  );
};

// A one-tap switch between light and dark, for the toolbar and menus.
export const ThemeQuickToggle = ({ className }: { className?: string }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const Icon = theme === "system" ? Monitor : dark ? Moon : Sun;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Icon className="size-5" />
    </Button>
  );
};
