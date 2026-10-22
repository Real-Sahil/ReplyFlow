import {
  Building2,
  House,
  Import,
  Kanban,
  Megaphone,
  MessageCircle,
  Package,
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

const Header = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const translate = useTranslate();

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/messenger_inbox/*", location.pathname)) {
    currentPath = "/messenger_inbox";
  } else if (matchPath("/page_posts/*", location.pathname)) {
    currentPath = "/page_posts";
  } else if (matchPath("/orders/*", location.pathname)) {
    currentPath = "/orders";
  } else if (matchPath("/products/*", location.pathname)) {
    currentPath = "/products";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else {
    currentPath = false;
  }

  return (
    <>
      <nav className="grow">
        <header className="bg-secondary">
          <div className="px-4 py-1.5">
            <div className="flex justify-between items-center flex-1">
              <Link
                to="/"
                className="flex items-center gap-2 text-secondary-foreground no-underline"
              >
                <img
                  className="[.light_&]:hidden h-6"
                  src={darkModeLogo}
                  alt={title}
                />
                <img
                  className="[.dark_&]:hidden h-6"
                  src={lightModeLogo}
                  alt={title}
                />
              </Link>
              <div>
                <nav className="flex items-center gap-1 overflow-x-auto">
                  <NavigationTab
                    label="Today"
                    Icon={House}
                    to="/"
                    isActive={currentPath === "/"}
                  />
                  <InboxTab active={currentPath === "/messenger_inbox"} />
                  <NavigationTab
                    label={translate("resources.contacts.name", {
                      smart_count: 2,
                    })}
                    Icon={Users}
                    to="/contacts"
                    isActive={currentPath === "/contacts"}
                  />
                  <NavigationTab
                    label={translate("resources.deals.name", {
                      smart_count: 2,
                    })}
                    Icon={Kanban}
                    to="/deals"
                    isActive={currentPath === "/deals"}
                  />
                  <NavigationTab
                    label={translate("resources.orders.name", {
                      smart_count: 2,
                      _: "Orders",
                    })}
                    Icon={Package}
                    to="/orders"
                    isActive={currentPath === "/orders"}
                  />
                  <NavigationTab
                    label="Posts"
                    Icon={Megaphone}
                    to="/page_posts"
                    isActive={currentPath === "/page_posts"}
                  />
                  <NavigationTab
                    label={translate("resources.products.name", {
                      smart_count: 2,
                      _: "Products",
                    })}
                    Icon={Sofa}
                    to="/products"
                    isActive={currentPath === "/products"}
                  />
                </nav>
              </div>
              <div className="flex items-center">
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
                  </CanAccess>
                  <CompaniesMenu />
                  <ImportFromJsonMenuItem />
                </UserMenu>
              </div>
            </div>
          </div>
        </header>
      </nav>
    </>
  );
};

const InboxTab = ({ active }: { active: boolean }) => {
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
    <NavigationTab
      label="Inbox"
      Icon={MessageCircle}
      to="/messenger_inbox"
      isActive={active}
      badge={total || undefined}
    />
  );
};

const NavigationTab = ({
  label,
  to,
  isActive,
  Icon,
  badge,
}: {
  label: string;
  to: string;
  isActive: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}) => (
  <Link
    to={to}
    aria-current={isActive ? "page" : undefined}
    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    <Icon className="size-4" />
    {label}
    {badge ? (
      <span className="rounded-full bg-primary px-1.5 text-[0.7rem] leading-5 text-primary-foreground tabular-nums">
        {badge}
      </span>
    ) : null}
  </Link>
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

export default Header;
