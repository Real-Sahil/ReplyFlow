import { ChevronLeft, Settings, User } from "lucide-react";
import { useTranslate, useUserMenu } from "ra-core";
import { Link, useLocation } from "react-router";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ThemeQuickToggle } from "../settings/AppearanceControls";
import { BrandLogo } from "./BrandLogo";
import { SECTIONS, sectionFor } from "./sections";

// On a record page (a contact, a deal), a way back to the list it came from.
// The toolbar an accountant sees: the finance pages only, and their own menu.
const ACCOUNTANT_TABS: { to: string; label: string }[] = [
  { to: "/accountant", label: "Accountant's pack" },
  { to: "/owed", label: "Owed and owing" },
  { to: "/invoices", label: "Invoices" },
  { to: "/bills", label: "Bills" },
  { to: "/money", label: "Money book" },
  { to: "/reports", label: "Reports" },
];

export const AccountantToolbar = () => {
  const { title } = useConfigurationContext();
  const location = useLocation();
  return (
    <header
      data-slot="toolbar"
      data-titlebar
      className="sticky top-0 z-30 border-b border-border"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
        <Link
          to="/accountant"
          aria-label={title}
          className="flex shrink-0 items-center gap-2 rounded-lg py-1 text-sm font-semibold tracking-tight"
        >
          <BrandLogo />
        </Link>
        <nav
          aria-label="Finance"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {ACCOUNTANT_TABS.map((tab) => {
            const active =
              location.pathname === tab.to ||
              location.pathname.startsWith(`${tab.to}/`);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeQuickToggle />
          <UserMenu>
            <ProfileMenu />
          </UserMenu>
        </div>
      </div>
    </header>
  );
};

export const RecordBackLink = () => {
  const location = useLocation();
  const active = sectionFor(location.pathname);
  const section = SECTIONS.find((s) => s.path === active);
  const segments = location.pathname.split("/").filter(Boolean);
  if (!section || section.path === "/" || segments.length < 2) return null;
  return (
    <Link
      to={section.path}
      className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {section.label}
    </Link>
  );
};

export const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};

export const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};
