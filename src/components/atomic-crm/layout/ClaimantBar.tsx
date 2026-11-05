import { LogOut } from "lucide-react";
import { useLogout } from "ra-core";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { cn } from "@/lib/utils";
import { ThemeQuickToggle } from "../settings/AppearanceControls";

// The only bar a staff sign-in sees: the business name, light or dark, sign out, and its three screens.
const TABS = [
  { to: "/claims", label: "Expenses" },
  { to: "/hours", label: "Hours" },
  { to: "/holiday", label: "Holiday" },
];

export const ClaimantBar = () => {
  const { pathname } = useLocation();
  const { darkModeLogo, title } = useConfigurationContext();
  const logout = useLogout();
  return (
    <header
      data-slot="toolbar"
      data-titlebar
      className="sticky top-0 z-30 border-b border-border"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <img src={darkModeLogo} alt="" className="h-5" />
          {title}
        </span>
        <div className="flex items-center gap-1">
          <ThemeQuickToggle />
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>
      <nav
        aria-label="Staff"
        className="mx-auto flex max-w-3xl gap-1 px-3 pb-2"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={pathname === tab.to ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium",
              pathname === tab.to
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
};
