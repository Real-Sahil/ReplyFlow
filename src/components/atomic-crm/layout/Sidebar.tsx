import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  Bug,
  Building2,
  CalendarCheck,
  ChartColumn,
  Clock,
  FileCheck2,
  FileText,
  HandCoins,
  Handshake,
  Import,
  Landmark,
  LayoutDashboard,
  Linkedin,
  MessageCircle,
  MessageSquare,
  Newspaper,
  Package,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Palmtree,
  Plug,
  Receipt,
  ReceiptText,
  Repeat,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  User,
  UserRound,
  Users,
  Wallet,
  Waves,
} from "lucide-react";
import { CanAccess, useGetList } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { UserMenu } from "@/components/admin/user-menu";
import { useAppBadge } from "@/hooks/use-app-badge";
import { cn } from "@/lib/utils";

import { useIsPlatformOwner } from "../businesses/useBusinesses";
import { ImportPage } from "../misc/ImportPage";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { GlobalSearchButton } from "../search/GlobalSearchButton";
import { ThemeQuickToggle } from "../settings/AppearanceControls";
import { BrandLogo } from "./BrandLogo";
import { ProfileMenu, SettingsMenu } from "./Header";
import { SECTIONS, sectionFor } from "./sections";

type Icon = ComponentType<{ className?: string }>;
type Access = "config" | "sales";

type Item = {
  to: string;
  label: string;
  Icon: Icon;
  access?: Access;
  ownerOnly?: boolean;
};
type Group = { title: string; items: Item[]; access?: Access };

// The main sections get an icon each; their labels and order come from the same list the rest of the app uses.
const SECTION_ICONS: Record<(typeof SECTIONS)[number]["path"], Icon> = {
  "/": LayoutDashboard,
  "/messenger_inbox": MessageSquare,
  "/contacts": Users,
  "/deals": Handshake,
  "/orders": ShoppingBag,
  "/page_posts": Newspaper,
  "/products": Package,
};

const GROUPS: Group[] = [
  {
    title: "Workspace",
    items: [
      { to: "/sales", label: "Team", Icon: Users, access: "sales" },
      { to: "/companies", label: "Companies", Icon: Building2 },
      { to: "/people", label: "People", Icon: UserRound, access: "config" },
      { to: "/hours", label: "Staff hours", Icon: Clock, access: "config" },
      {
        to: "/holiday",
        label: "Staff holiday",
        Icon: Palmtree,
        access: "config",
      },
      {
        to: "/paperwork",
        label: "Paperwork",
        Icon: FileCheck2,
        access: "config",
      },
      { to: "/assets", label: "Equipment", Icon: Truck, access: "config" },
      { to: ImportPage.path, label: "Import data", Icon: Import },
    ],
  },
  {
    title: "Money",
    items: [
      {
        to: "/summary",
        label: "Weekly summary",
        Icon: CalendarCheck,
        access: "config",
      },
      { to: "/owed", label: "Owed and owing", Icon: HandCoins },
      { to: "/statements", label: "Customer statements", Icon: FileText },
      { to: "/recurring", label: "Repeating", Icon: Repeat, access: "config" },
      { to: "/cashflow", label: "Cash flow", Icon: Waves, access: "config" },
      {
        to: "/insights",
        label: "Insights",
        Icon: ChartColumn,
        access: "config",
      },
      { to: "/bank", label: "Bank match", Icon: Landmark },
      { to: "/invoices", label: "Invoices", Icon: Receipt },
      { to: "/bills", label: "Bills and expenses", Icon: Wallet },
      {
        to: "/claims",
        label: "Staff expenses",
        Icon: ReceiptText,
        access: "config",
      },
      { to: "/money", label: "Money book", Icon: BookOpen },
      { to: "/stock", label: "Stock", Icon: Boxes },
      { to: "/suppliers", label: "Suppliers and shopping", Icon: Store },
      { to: "/reports", label: "Reports", Icon: ChartColumn },
      { to: "/accountant", label: "Accountant's pack", Icon: PackageCheck },
      {
        to: "/business",
        label: "Business and VAT",
        Icon: Landmark,
        access: "config",
      },
    ],
  },
  {
    title: "Channels",
    access: "config",
    items: [
      { to: "/facebook", label: "Facebook connection", Icon: Plug },
      {
        to: "/messenger_settings/1",
        label: "Messenger auto-replies",
        Icon: MessageCircle,
      },
      { to: "/linkedin_pages", label: "LinkedIn Pages", Icon: Linkedin },
      { to: "/linkedin_ads", label: "LinkedIn ads", Icon: ChartColumn },
      { to: "/errors", label: "Error log", Icon: Bug },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/settings", label: "Settings", Icon: Settings, access: "config" },
      { to: "/channels", label: "Accounts", Icon: Plug },
      { to: "/profile", label: "My profile", Icon: User },
      { to: "/linkedin", label: "LinkedIn", Icon: Linkedin },
      {
        to: "/businesses",
        label: "Businesses",
        Icon: Building2,
        ownerOnly: true,
      },
    ],
  },
];

const STORAGE_KEY = "replyflow.sidebar";

// Open on a wide screen, narrow rail on a small one, until the person chooses. The choice is remembered.
const useCollapsed = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "open" || saved === "rail") return saved === "rail";
    } catch {
      // storage can be blocked; fall through to the screen width
    }
    return typeof window !== "undefined" && window.innerWidth < 1024;
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "rail" : "open");
    } catch {
      // not remembered, still works
    }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
};

const Gate = ({
  access,
  children,
}: {
  access?: Access;
  children: ReactNode;
}) => {
  if (access === "config")
    return (
      <CanAccess resource="configuration" action="edit">
        {children}
      </CanAccess>
    );
  if (access === "sales")
    return (
      <CanAccess resource="sales" action="list">
        {children}
      </CanAccess>
    );
  return <>{children}</>;
};

const NavLink = ({
  to,
  label,
  Icon,
  active,
  rail,
  badge,
}: {
  to: string;
  label: string;
  Icon: Icon;
  active: boolean;
  rail: boolean;
  badge?: number;
}) => (
  <Link
    to={to}
    title={rail ? label : undefined}
    aria-label={rail ? label : undefined}
    aria-current={active ? "page" : undefined}
    className={cn(
      "relative flex h-9 shrink-0 items-center gap-3 rounded-lg text-sm font-medium",
      rail ? "w-9 justify-center self-center" : "px-2.5",
      active
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    )}
  >
    <Icon className="size-4 shrink-0" />
    {rail ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
    {badge && badge > 0 ? (
      <span
        className={cn(
          "rounded-full bg-primary px-1.5 font-mono text-xs leading-4 text-primary-foreground tabular-nums",
          rail && "absolute -top-1 -right-1 px-1 text-[10px] leading-3.5",
        )}
      >
        {badge}
      </span>
    ) : null}
  </Link>
);

// The frame both sidebars share: brand and a collapse button, optional search, the navigation, and the tools
// and user menu at the foot. It scrolls on its own when the list is longer than the screen.
const SidebarFrame = ({
  home,
  search,
  nav,
  tools,
  menu,
}: {
  home: string;
  search: boolean;
  nav: (rail: boolean) => ReactNode;
  tools: ReactNode;
  menu: ReactNode;
}) => {
  const { title } = useConfigurationContext();
  const [rail, setRail] = useCollapsed();
  return (
    <aside
      data-slot="sidebar"
      aria-label="Navigation"
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border transition-[width] duration-200",
        rail ? "w-[68px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 px-3",
          rail ? "justify-center" : "justify-between",
        )}
      >
        {rail ? null : (
          <Link
            to={home}
            aria-label={title}
            className="flex min-w-0 items-center rounded-lg py-1 pl-1"
          >
            <BrandLogo />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setRail(!rail)}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {rail ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>
      </div>

      {search ? (
        <div
          className={cn("shrink-0 pb-2", rail ? "flex justify-center" : "px-3")}
        >
          <GlobalSearchButton
            variant={rail ? "icon" : "labelled"}
            className={rail ? undefined : "w-full md:w-full lg:w-full"}
          />
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]"
      >
        {nav(rail)}
      </nav>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-t border-border p-2",
          rail ? "flex-col" : "justify-between px-3",
        )}
      >
        <div className={cn("flex items-center gap-1", rail && "flex-col")}>
          {tools}
        </div>
        {menu}
      </div>
    </aside>
  );
};

export const Sidebar = () => {
  const { pathname } = useLocation();
  const owner = useIsPlatformOwner();
  const active = sectionFor(pathname);
  const { total: unread } = useGetList("messenger_inbox", {
    filter: { unread: true },
    pagination: { page: 1, perPage: 1 },
  });
  const { total: newComments } = useGetList("page_comments", {
    filter: { status: "new" },
    pagination: { page: 1, perPage: 1 },
  });
  const inboxCount = (unread ?? 0) + (newComments ?? 0);
  useAppBadge(inboxCount);

  const isActive = (to: string) => !!matchPath(`${to}/*`, pathname);

  return (
    <SidebarFrame
      home="/"
      search
      tools={
        <>
          <RefreshButton />
          <ThemeQuickToggle />
        </>
      }
      menu={
        <UserMenu>
          <ProfileMenu />
          <CanAccess resource="configuration" action="edit">
            <SettingsMenu />
          </CanAccess>
        </UserMenu>
      }
      nav={(rail) => (
        <>
          {SECTIONS.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              label={label}
              Icon={SECTION_ICONS[path]}
              active={active === path}
              rail={rail}
              badge={path === "/messenger_inbox" ? inboxCount : undefined}
            />
          ))}
          {GROUPS.map((group) => (
            <Gate key={group.title} access={group.access}>
              <div className="mt-3 flex shrink-0 flex-col gap-0.5">
                {rail ? (
                  <div
                    aria-hidden
                    className="mx-auto mb-1 h-px w-6 bg-border"
                  />
                ) : (
                  <p className="px-2.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                    {group.title}
                  </p>
                )}
                {group.items
                  .filter((item) => !item.ownerOnly || owner)
                  .map((item) => (
                    <Gate key={item.to} access={item.access}>
                      <NavLink
                        to={item.to}
                        label={item.label}
                        Icon={item.Icon}
                        active={isActive(item.to)}
                        rail={rail}
                      />
                    </Gate>
                  ))}
              </div>
            </Gate>
          ))}
        </>
      )}
    />
  );
};

// What an accountant sees: the finance pages only, in the same sidebar.
const ACCOUNTANT_ITEMS: Item[] = [
  { to: "/accountant", label: "Accountant's pack", Icon: PackageCheck },
  { to: "/owed", label: "Owed and owing", Icon: HandCoins },
  { to: "/invoices", label: "Invoices", Icon: Receipt },
  { to: "/bills", label: "Bills", Icon: Wallet },
  { to: "/money", label: "Money book", Icon: BookOpen },
  { to: "/reports", label: "Reports", Icon: ChartColumn },
];

export const AccountantSidebar = () => {
  const { pathname } = useLocation();
  return (
    <SidebarFrame
      home="/accountant"
      search={false}
      tools={<ThemeQuickToggle />}
      menu={
        <UserMenu>
          <ProfileMenu />
        </UserMenu>
      }
      nav={(rail) => (
        <>
          {ACCOUNTANT_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              label={item.label}
              Icon={item.Icon}
              active={!!matchPath(`${item.to}/*`, pathname)}
              rail={rail}
            />
          ))}
        </>
      )}
    />
  );
};
