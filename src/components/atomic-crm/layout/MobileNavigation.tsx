import { useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  Boxes,
  ChartColumn,
  Bug,
  Building2,
  ChevronRight,
  Home,
  Import,
  Landmark,
  Kanban,
  ListTodo,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Package,
  PackageCheck,
  Plug,
  Receipt,
  Plus,
  Settings,
  Sofa,
  Sparkles,
  User,
  Users,
  Wallet,
  HandCoins,
  CalendarCheck,
  Store,
  UserRound,
} from "lucide-react";
import { CanAccess, useGetList, useTranslate } from "ra-core";
import {
  Link,
  matchPath,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ThemeQuickToggle } from "../settings/AppearanceControls";
import { cn } from "@/lib/utils";
import { useAppBadge } from "@/hooks/use-app-badge";
import { ContactCreateSheet } from "../contacts/ContactCreateSheet";
import { NoteCreateSheet } from "../notes/NoteCreateSheet";
import { TaskCreateSheet } from "../tasks/TaskCreateSheet";
import { ImportPage } from "../misc/ImportPage";

// The bottom bar: the four places people go most, the create button, and More.
export const MobileNavigation = () => {
  const location = useLocation();
  const translate = useTranslate();
  const [moreOpen, setMoreOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  // The selected tab's glass lens is one element that glides to the new tab on a spring, the way
  // the system tab bar does, instead of each tab switching its own background on and off.
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [lensReady, setLensReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const bar = barRef.current;
      const target = bar?.querySelector<HTMLElement>("[data-lens-target]");
      if (!bar || !target) {
        setLens(null);
        return;
      }
      const a = bar.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      setLens({ x: b.left - a.left, y: b.top - a.top });
    };
    measure();
    // Let the first position settle without animating from the corner.
    const frame = requestAnimationFrame(() => setLensReady(true));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [location.pathname]);

  const isActive = (path: string) =>
    path === "/"
      ? !!matchPath("/", location.pathname)
      : !!matchPath(`${path}/*`, location.pathname);

  return (
    <nav
      aria-label={translate("crm.navigation.label")}
      className="glass fixed inset-x-3 z-50 rounded-[28px]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <div
        ref={barRef}
        className="relative mx-auto grid h-16 max-w-md grid-cols-6 items-center px-1"
      >
        <span
          aria-hidden
          className="lens pointer-events-none absolute left-0 top-0 h-7 w-12 rounded-full"
          style={{
            transform: `translate(${lens?.x ?? 0}px, ${lens?.y ?? 0}px)`,
            opacity: lens ? 1 : 0,
            transition: lensReady
              ? "transform 520ms var(--spring), opacity 200ms ease"
              : "none",
          }}
        />
        <NavigationButton
          href="/"
          Icon={Home}
          label={translate("ra.page.dashboard")}
          isActive={isActive("/")}
        />
        <InboxButton isActive={isActive("/messenger_inbox")} />
        <NavigationButton
          href="/contacts"
          Icon={Users}
          label={translate("resources.contacts.name", { smart_count: 2 })}
          isActive={isActive("/contacts")}
        />
        <CreateButton />
        <NavigationButton
          href="/orders"
          Icon={Package}
          label="Orders"
          isActive={isActive("/orders")}
        />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex h-full flex-col items-center justify-center gap-0.5 rounded-xl text-muted-foreground"
        >
          <MoreHorizontal className="size-6" />
          <span className="text-xs font-medium">More</span>
        </button>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </nav>
  );
};

const NavigationButton = ({
  href,
  Icon,
  label,
  isActive,
}: {
  href: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  isActive: boolean;
}) => (
  <Link
    to={href}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "flex h-full flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
      isActive ? "text-primary" : "text-muted-foreground",
    )}
  >
    <span
      data-lens-target={isActive ? "" : undefined}
      className="relative flex h-7 w-12 items-center justify-center rounded-full"
    >
      <Icon className="size-5" />
    </span>
    <span className="text-xs font-medium">{label}</span>
  </Link>
);

// The inbox shows how many customers are waiting on Messenger or comments.
const InboxButton = ({ isActive }: { isActive: boolean }) => {
  const { total: unread } = useGetList("messenger_inbox", {
    filter: { unread: true },
    pagination: { page: 1, perPage: 1 },
  });
  const { total: newComments } = useGetList("page_comments", {
    filter: { status: "new" },
    pagination: { page: 1, perPage: 1 },
  });
  const total = (unread ?? 0) + (newComments ?? 0);
  useAppBadge(total);
  return (
    <Link
      to="/messenger_inbox"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex h-full flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
        isActive ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        data-lens-target={isActive ? "" : undefined}
        className="relative flex h-7 w-12 items-center justify-center rounded-full"
      >
        <MessageCircle className="size-5" />
      </span>
      {total ? (
        <span className="absolute right-3 top-1 rounded-full bg-primary px-1.5 font-mono text-xs leading-4 text-primary-foreground tabular-nums">
          {total}
        </span>
      ) : null}
      <span className="text-xs font-medium">Inbox</span>
    </Link>
  );
};

// Everything that is not a daily destination: grouped lists, one row each,
// with a short line saying what is behind it.
const MoreSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="glass max-h-[88vh] gap-0 overflow-y-auto rounded-t-2xl px-4 pb-8"
    >
      <SheetHeader className="px-1 pt-7 pb-4">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle className="text-2xl font-semibold tracking-tight">
            More
          </SheetTitle>
          <ThemeQuickToggle className="mr-8" />
        </div>
      </SheetHeader>
      <div className="stagger flex flex-col gap-6">
        <MoreGroup title="Sell and publish">
          <MoreRow
            to="/tasks"
            label="Tasks"
            detail="Follow-ups and to-dos"
            Icon={ListTodo}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/deals"
            label="Deals"
            detail="The pipeline, stage by stage"
            Icon={Kanban}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/products"
            label="Products"
            detail="What you sell"
            Icon={Sofa}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/page_posts"
            label="Posts"
            detail="Write, schedule and publish"
            Icon={Megaphone}
            onPick={onOpenChange}
          />
        </MoreGroup>
        <MoreGroup title="Workspace">
          <CanAccess resource="sales" action="list">
            <MoreRow
              to="/sales"
              label="Team"
              detail="Who can sign in"
              Icon={Users}
              onPick={onOpenChange}
            />
          </CanAccess>
          <MoreRow
            to="/companies"
            label="Companies"
            detail="Businesses you deal with"
            Icon={Building2}
            onPick={onOpenChange}
          />
          <CanAccess resource="configuration" action="edit">
            <MoreRow
              to="/people"
              label="People"
              detail="Staff, holiday and documents"
              Icon={UserRound}
              onPick={onOpenChange}
            />
          </CanAccess>
          <MoreRow
            to={ImportPage.path}
            label="Import data"
            detail="Bring in contacts and deals"
            Icon={Import}
            onPick={onOpenChange}
          />
        </MoreGroup>
        <MoreGroup title="Money">
          <CanAccess resource="configuration" action="edit">
            <MoreRow
              to="/summary"
              label="Weekly summary"
              detail="Your week in money, stock and orders"
              Icon={CalendarCheck}
              onPick={onOpenChange}
            />
          </CanAccess>
          <MoreRow
            to="/owed"
            label="Owed and owing"
            detail="Who owes you, and who you owe"
            Icon={HandCoins}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/bank"
            label="Bank match"
            detail="Match a bank statement to invoices and bills"
            Icon={Landmark}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/invoices"
            label="Invoices"
            detail="Invoices and credit notes, by order"
            Icon={Receipt}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/bills"
            label="Bills and expenses"
            detail="Supplier bills, receipts and VAT"
            Icon={Wallet}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/suppliers"
            label="Suppliers and shopping"
            detail="Who you buy from, and what to reorder"
            Icon={Store}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/money"
            label="Money book"
            detail="Everything in and out, wages and tax included"
            Icon={BookOpen}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/stock"
            label="Stock"
            detail="What you hold, buy and use in production"
            Icon={Boxes}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/reports"
            label="Reports"
            detail="Profit and loss, sales channels, cash forecast"
            Icon={ChartColumn}
            onPick={onOpenChange}
          />
          <MoreRow
            to="/accountant"
            label="Accountant's pack"
            detail="Files for Xero, QuickBooks and Sage, and VAT workings"
            Icon={PackageCheck}
            onPick={onOpenChange}
          />
          <CanAccess resource="configuration" action="edit">
            <MoreRow
              to="/business"
              label="Business and VAT"
              detail="Details on invoices, and the VAT switch"
              Icon={Landmark}
              onPick={onOpenChange}
            />
          </CanAccess>
        </MoreGroup>
        <CanAccess resource="configuration" action="edit">
          <MoreGroup title="Channels">
            <MoreRow
              to="/facebook"
              label="Facebook"
              detail="Connected Pages"
              Icon={Plug}
              onPick={onOpenChange}
            />
            <MoreRow
              to="/messenger_settings/1"
              label="Auto-replies"
              detail="Greeting and away messages"
              Icon={MessageCircle}
              onPick={onOpenChange}
            />
            <MoreRow
              to="/errors"
              label="Error log"
              detail="What went wrong, and when"
              Icon={Bug}
              onPick={onOpenChange}
            />
          </MoreGroup>
        </CanAccess>
        <MoreGroup title="Account">
          <CanAccess resource="configuration" action="edit">
            <MoreRow
              to="/settings"
              label="Settings"
              detail="Business details and pipeline"
              Icon={Settings}
              onPick={onOpenChange}
            />
          </CanAccess>
          <MoreRow
            to="/profile"
            label="My profile"
            detail="Your name, photo and password"
            Icon={User}
            onPick={onOpenChange}
          />
        </MoreGroup>
        <p className="px-1 text-center text-xs text-muted-foreground">
          Version{" "}
          {typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__}
        </p>
      </div>
    </SheetContent>
  </Sheet>
);

// One white cell per group; rows are split by hairlines inset past the icon.
const MoreGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-1.5">
    <h3 className="px-1 text-sm font-semibold text-muted-foreground">
      {title}
    </h3>
    <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] [&>a+a]:before:absolute [&>a+a]:before:inset-x-0 [&>a+a]:before:top-0 [&>a+a]:before:ml-14 [&>a+a]:before:h-px [&>a+a]:before:bg-border">
      {children}
    </div>
  </section>
);

const MoreRow = ({
  to,
  label,
  detail,
  Icon,
  onPick,
}: {
  to: string;
  label: string;
  detail: string;
  Icon: React.ComponentType<{ className?: string }>;
  onPick: (open: boolean) => void;
}) => (
  <Link
    to={to}
    onClick={() => onPick(false)}
    className="press group relative flex min-h-14 items-center gap-3 px-3 py-2 active:bg-muted"
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
      <Icon className="size-[18px]" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-base font-medium">{label}</span>
      <span className="block truncate text-sm text-muted-foreground">
        {detail}
      </span>
    </span>
    <ChevronRight
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground/60"
    />
  </Link>
);

const CreateButton = () => {
  const translate = useTranslate();
  const contact_id = useMatch("/contacts/:id/*")?.params.id;
  const [contactCreateOpen, setContactCreateOpen] = useState(false);
  const [noteCreateOpen, setNoteCreateOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <ContactCreateSheet
        open={contactCreateOpen}
        onOpenChange={setContactCreateOpen}
      />
      <NoteCreateSheet
        open={noteCreateOpen}
        onOpenChange={setNoteCreateOpen}
        contact_id={contact_id}
      />
      <TaskCreateSheet
        open={taskCreateOpen}
        onOpenChange={setTaskCreateOpen}
        contact_id={contact_id}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="mx-auto size-12 rounded-full"
            aria-label={translate("ra.action.create")}
          >
            <Plus className="size-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            onSelect={() => setContactCreateOpen(true)}
          >
            {translate("resources.contacts.forcedCaseName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            onSelect={() => setNoteCreateOpen(true)}
          >
            {translate("resources.notes.forcedCaseName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            onSelect={() => setTaskCreateOpen(true)}
          >
            {translate("resources.tasks.forcedCaseName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-12 gap-2 px-4 text-base"
            onSelect={() => {
              // Opens the Posts screen with the listing picker in view.
              navigate("/page_posts", { state: { planWithAi: true } });
            }}
          >
            <Sparkles className="size-5" />
            AI post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
