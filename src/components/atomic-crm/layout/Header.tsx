import {
  Building2,
  House,
  Import,
  Kanban,
  Megaphone,
  MessageCircle,
  Package,
  Plug,
  Settings,
  Sofa,
  User,
  Users,
} from "lucide-react";
import { CanAccess, useGetList, useTranslate, useUserMenu } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { path: "/", label: "Today", Icon: House },
  { path: "/messenger_inbox", label: "Inbox", Icon: MessageCircle },
  { path: "/contacts", label: "Contacts", Icon: Users },
  { path: "/deals", label: "Deals", Icon: Kanban },
  { path: "/orders", label: "Orders", Icon: Package },
  { path: "/page_posts", label: "Posts", Icon: Megaphone },
  { path: "/products", label: "Products", Icon: Sofa },
] as const;

// The section of the app the current address belongs to.
const sectionFor = (pathname: string) => {
  if (matchPath("/", pathname)) return "/";
  return (
    SECTIONS.find((s) => s.path !== "/" && matchPath(`${s.path}/*`, pathname))
      ?.path ?? null
  );
};

// Left navigation rail: icons, with the name on hover, in the violet panel.
export const SideRail = () => {
  const { darkModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const active = sectionFor(location.pathname);
  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-20 shrink-0 flex-col items-center gap-3 rounded-3xl bg-sidebar py-5 text-sidebar-foreground shadow-lg md:flex">
      <Link
        to="/"
        aria-label={title}
        className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-white/15"
      >
        <img src={darkModeLogo} alt="" className="h-5 brightness-0 invert" />
      </Link>
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col items-center gap-2"
      >
        {SECTIONS.map(({ path, label, Icon }) =>
          path === "/messenger_inbox" ? (
            <InboxRailLink key={path} active={active === path} />
          ) : (
            <RailLink
              key={path}
              to={path}
              label={label}
              Icon={Icon}
              active={active === path}
            />
          ),
        )}
      </nav>
    </aside>
  );
};

const InboxRailLink = ({ active }: { active: boolean }) => {
  const { total: unread } = useGetList("messenger_inbox", {
    filter: { unread: true },
    pagination: { page: 1, perPage: 1 },
  });
  const { total: newComments } = useGetList("page_comments", {
    filter: { status: "new" },
    pagination: { page: 1, perPage: 1 },
  });
  const total = (unread ?? 0) + (newComments ?? 0);
  return (
    <RailLink
      to="/messenger_inbox"
      label="Inbox"
      Icon={MessageCircle}
      active={active}
      badge={total || undefined}
    />
  );
};

const RailLink = ({
  to,
  label,
  Icon,
  active,
  badge,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
}) => (
  <Link
    to={to}
    title={label}
    aria-label={label}
    aria-current={active ? "page" : undefined}
    className={cn(
      "relative flex size-11 items-center justify-center rounded-2xl transition-colors",
      active
        ? "bg-white text-sidebar shadow-sm"
        : "text-sidebar-foreground/75 hover:bg-white/15 hover:text-sidebar-foreground",
    )}
  >
    <Icon className="size-5" />
    {badge ? (
      <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[0.65rem] leading-4 font-semibold text-white tabular-nums">
        {badge}
      </span>
    ) : null}
  </Link>
);

// Top bar: the section name, search, theme, refresh and the user menu.
export const TopBar = () => {
  const location = useLocation();
  const active = sectionFor(location.pathname);
  const label = SECTIONS.find((s) => s.path === active)?.label ?? "ReplyFlow";
  return (
    <header className="flex items-center justify-between gap-3 rounded-3xl bg-card px-4 py-3 shadow-sm md:px-6">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Workspace</p>
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {label}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <GlobalSearchButton />
        <ThemeModeToggle />
        <RefreshButton />
        <UserMenu>
          <ProfileMenu />
          <CanAccess resource="sales" action="list">
            <UsersMenu />
          </CanAccess>
          <CanAccess resource="configuration" action="edit">
            <SettingsMenu />
            <MessengerSettingsMenu />
            <FacebookMenu />
          </CanAccess>
          <CompaniesMenu />
          <ImportFromJsonMenuItem />
        </UserMenu>
      </div>
    </header>
  );
};

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users />
        {translate("resources.sales.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
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

const SettingsMenu = () => {
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

const MessengerSettingsMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<MessengerSettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/messenger_settings/1" className="flex items-center gap-2">
        <MessageCircle />
        Messenger auto-replies
      </Link>
    </DropdownMenuItem>
  );
};

const FacebookMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<FacebookMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/facebook" className="flex items-center gap-2">
        <Plug />
        Facebook connection
      </Link>
    </DropdownMenuItem>
  );
};

const CompaniesMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<CompaniesMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/companies" className="flex items-center gap-2">
        <Building2 />
        Companies
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};
