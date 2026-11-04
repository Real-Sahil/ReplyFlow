import { useState } from "react";
import { Link, matchPath, useLocation } from "react-router";
import {
  BookOpen,
  ChartColumn,
  HandCoins,
  LogOut,
  MoreHorizontal,
  PackageCheck,
  Receipt,
  User,
  Wallet,
} from "lucide-react";
import { useLogout } from "ra-core";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { ThemeQuickToggle } from "../settings/AppearanceControls";

const TABS = [
  { to: "/accountant", label: "Pack", Icon: PackageCheck },
  { to: "/owed", label: "Owed", Icon: HandCoins },
  { to: "/invoices", label: "Invoices", Icon: Receipt },
  { to: "/bills", label: "Bills", Icon: Wallet },
  { to: "/money", label: "Money", Icon: BookOpen },
];

// The bottom bar for an accountant on a phone: the finance pages, and a menu for the rest.
export const AccountantMobileNav = () => {
  const location = useLocation();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const active = (to: string) => !!matchPath(`${to}/*`, location.pathname);
  return (
    <nav
      aria-label="Finance"
      className="glass fixed inset-x-3 z-50 rounded-[28px]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-6 items-center px-1">
        {TABS.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={active(to) ? "page" : undefined}
            className={cn(
              "flex h-full flex-col items-center justify-center gap-0.5 rounded-xl",
              active(to) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex h-full flex-col items-center justify-center gap-0.5 rounded-xl text-muted-foreground"
        >
          <MoreHorizontal className="size-6" />
          <span className="text-xs font-medium">More</span>
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="glass gap-0 rounded-t-2xl px-4 pb-8"
        >
          <SheetHeader className="px-1 pt-7 pb-4">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-2xl font-semibold tracking-tight">
                More
              </SheetTitle>
              <ThemeQuickToggle className="mr-8" />
            </div>
          </SheetHeader>
          <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            {[
              { to: "/reports", label: "Reports", Icon: ChartColumn },
              { to: "/profile", label: "My profile", Icon: User },
            ].map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex min-h-14 items-center gap-3 border-b px-4 py-2 last:border-b-0"
              >
                <Icon className="size-5 text-muted-foreground" />
                <span className="text-base font-medium">{label}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => logout()}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
            >
              <LogOut className="size-5 text-muted-foreground" />
              <span className="text-base font-medium">Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
};
