import { LogOut } from "lucide-react";
import { useLogout } from "ra-core";

import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ThemeQuickToggle } from "../settings/AppearanceControls";

// The only bar an expenses-only sign-in sees: the business name, light or dark, and sign out.
export const ClaimantBar = () => {
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
    </header>
  );
};
