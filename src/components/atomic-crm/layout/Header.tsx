import { ChevronLeft, Settings, User } from "lucide-react";
import { useTranslate, useUserMenu } from "ra-core";
import { Link, useLocation } from "react-router";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { SECTIONS, sectionFor } from "./sections";

// On a record page (a contact, a deal), a way back to the list it came from.
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
