import { useLayoutEffect, useRef, useState } from "react";
import {
  Bug,
  Building2,
  ChevronLeft,
  MoreHorizontal,
  Import,
  MessageCircle,
  Plug,
  Settings,
  User,
  Users,
} from "lucide-react";
import { CanAccess, useGetList, useTranslate, useUserMenu } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { path: "/", label: "Today" },
  { path: "/messenger_inbox", label: "Inbox" },
  { path: "/contacts", label: "Contacts" },
  { path: "/deals", label: "Deals" },
  { path: "/orders", label: "Orders" },
  { path: "/page_posts", label: "Posts" },
  { path: "/products", label: "Products" },
] as const;

// The section of the app the current address belongs to.
const sectionFor = (pathname: string) => {
  if (matchPath("/", pathname)) return "/";
  return (
    SECTIONS.find((s) => s.path !== "/" && matchPath(`${s.path}/*`, pathname))
      ?.path ?? null
  );
};

// The toolbar: brand, the sections as tabs with a sliding marker, then search,
// refresh, More and the user menu. It stays put and blurs what scrolls under it.
export const Toolbar = () => {
  const { darkModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const active = sectionFor(location.pathname);
  const { total: unread } = useGetList("messenger_inbox", {
    filter: { unread: true },
    pagination: { page: 1, perPage: 1 },
  });
  const { total: newComments } = useGetList("page_comments", {
    filter: { status: "new" },
    pagination: { page: 1, perPage: 1 },
  });
  const inboxCount = (unread ?? 0) + (newComments ?? 0);

  return (
    <header
      data-slot="toolbar"
      className="sticky top-0 z-30 border-b border-border"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
        <Link
          to="/"
          aria-label={title}
          className="flex shrink-0 items-center gap-2 rounded-lg py-1 text-[15px] font-semibold tracking-tight"
        >
          <img src={darkModeLogo} alt="" className="h-5" />
          <span className="hidden lg:inline">{title}</span>
        </Link>
        <Tabs active={active} inboxCount={inboxCount} />
        <div className="flex shrink-0 items-center gap-1">
          <GlobalSearchButton />
          <RefreshButton />
          <MoreMenu />
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
      </div>
    </header>
  );
};

// The marker is one element that glides under the active tab. It moves with
// transform only: a fixed 100px bar, scaled to the tab's width.
const Tabs = ({
  active,
  inboxCount,
}: {
  active: string | null;
  inboxCount: number;
}) => {
  const listRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = listRef.current?.querySelector<HTMLElement>(
        '[aria-current="page"]',
      );
      setMarker(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, inboxCount]);

  return (
    <nav
      ref={listRef}
      aria-label="Main"
      className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SECTIONS.map(({ path, label }) => (
        <Link
          key={path}
          to={path}
          aria-current={active === path ? "page" : undefined}
          className={cn(
            "relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
            active === path
              ? "text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {label}
          {path === "/messenger_inbox" && inboxCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 font-mono text-xs leading-4 text-primary-foreground tabular-nums">
              {inboxCount}
            </span>
          ) : null}
        </Link>
      ))}
      {marker ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-[100px] origin-left rounded-full bg-primary transition-transform duration-300 ease-[var(--spring)]"
          style={{
            transform: `translateX(${marker.x}px) scaleX(${marker.w / 100})`,
          }}
        />
      ) : null}
    </nav>
  );
};

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

// Links that used to sit only in the user menu, grouped so they are easy to find.
const MoreLink = ({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
  >
    <Icon className="size-4 text-muted-foreground" />
    {label}
  </Link>
);

const MoreGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-0.5">
    <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
      {title}
    </p>
    {children}
  </div>
);

const MoreMenu = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="More"
        title="More"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-5" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="bottom" align="end" className="w-64 p-2">
      <MoreGroup title="Workspace">
        <CanAccess resource="sales" action="list">
          <MoreLink to="/sales" label="Team" Icon={Users} />
        </CanAccess>
        <MoreLink to="/companies" label="Companies" Icon={Building2} />
        <MoreLink to={ImportPage.path} label="Import data" Icon={Import} />
      </MoreGroup>
      <CanAccess resource="configuration" action="edit">
        <MoreGroup title="Channels">
          <MoreLink to="/facebook" label="Facebook connection" Icon={Plug} />
          <MoreLink
            to="/messenger_settings/1"
            label="Messenger auto-replies"
            Icon={MessageCircle}
          />
          <MoreLink to="/errors" label="Error log" Icon={Bug} />
        </MoreGroup>
      </CanAccess>
      <MoreGroup title="Account">
        <CanAccess resource="configuration" action="edit">
          <MoreLink to="/settings" label="Settings" Icon={Settings} />
        </CanAccess>
        <MoreLink to="/profile" label="My profile" Icon={User} />
      </MoreGroup>
    </PopoverContent>
  </Popover>
);

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
