import { useState } from "react";
import {
  Bug,
  Building2,
  Home,
  Import,
  Kanban,
  ListTodo,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Package,
  Plug,
  Plus,
  Settings,
  Sofa,
  Sparkles,
  User,
  Users,
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
import { cn } from "@/lib/utils";
import { ContactCreateSheet } from "../contacts/ContactCreateSheet";
import { NoteCreateSheet } from "../notes/NoteCreateSheet";
import { TaskCreateSheet } from "../tasks/TaskCreateSheet";
import { ImportPage } from "../misc/ImportPage";

// The bottom bar: the four places people go most, the create button, and More.
export const MobileNavigation = () => {
  const location = useLocation();
  const translate = useTranslate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/"
      ? !!matchPath("/", location.pathname)
      : !!matchPath(`${path}/*`, location.pathname);

  return (
    <nav
      aria-label={translate("crm.navigation.label")}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-6 items-center px-1">
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
      className={cn(
        "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
        isActive && "bg-primary/10",
      )}
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
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
          isActive && "bg-primary/10",
        )}
      >
        <MessageCircle className="size-5" />
      </span>
      {total ? (
        <span className="absolute right-3 top-1 rounded-full bg-rose-600 px-1.5 text-xs leading-4 font-semibold text-white tabular-nums">
          {total}
        </span>
      ) : null}
      <span className="text-xs font-medium">Inbox</span>
    </Link>
  );
};

// Everything that is not a daily destination, in large touch targets.
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
      className="max-h-[85vh] gap-5 overflow-y-auto rounded-t-3xl px-4 pb-8"
    >
      <SheetHeader className="px-0 pt-2">
        <SheetTitle className="text-lg">More</SheetTitle>
      </SheetHeader>
      <MoreGroup title="Sell and publish">
        <MoreTile
          to="/tasks"
          label="Tasks"
          Icon={ListTodo}
          onPick={onOpenChange}
        />
        <MoreTile
          to="/deals"
          label="Deals"
          Icon={Kanban}
          onPick={onOpenChange}
        />
        <MoreTile
          to="/products"
          label="Products"
          Icon={Sofa}
          onPick={onOpenChange}
        />
        <MoreTile
          to="/page_posts"
          label="Posts"
          Icon={Megaphone}
          onPick={onOpenChange}
        />
      </MoreGroup>
      <MoreGroup title="Workspace">
        <CanAccess resource="sales" action="list">
          <MoreTile
            to="/sales"
            label="Team"
            Icon={Users}
            onPick={onOpenChange}
          />
        </CanAccess>
        <MoreTile
          to="/companies"
          label="Companies"
          Icon={Building2}
          onPick={onOpenChange}
        />
        <MoreTile
          to={ImportPage.path}
          label="Import data"
          Icon={Import}
          onPick={onOpenChange}
        />
      </MoreGroup>
      <CanAccess resource="configuration" action="edit">
        <MoreGroup title="Channels">
          <MoreTile
            to="/facebook"
            label="Facebook"
            Icon={Plug}
            onPick={onOpenChange}
          />
          <MoreTile
            to="/messenger_settings/1"
            label="Auto-replies"
            Icon={MessageCircle}
            onPick={onOpenChange}
          />
          <MoreTile
            to="/errors"
            label="Error log"
            Icon={Bug}
            onPick={onOpenChange}
          />
        </MoreGroup>
      </CanAccess>
      <MoreGroup title="Account">
        <CanAccess resource="configuration" action="edit">
          <MoreTile
            to="/settings"
            label="Settings"
            Icon={Settings}
            onPick={onOpenChange}
          />
        </CanAccess>
        <MoreTile
          to="/profile"
          label="My profile"
          Icon={User}
          onPick={onOpenChange}
        />
      </MoreGroup>
    </SheetContent>
  </Sheet>
);

const MoreGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
    <div className="grid grid-cols-3 gap-2">{children}</div>
  </section>
);

// A large tile: at least 44px tall, with the name under the icon.
const MoreTile = ({
  to,
  label,
  Icon,
  onPick,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onPick: (open: boolean) => void;
}) => (
  <Link
    to={to}
    onClick={() => onPick(false)}
    className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-muted p-3 text-center text-sm font-medium transition-colors active:bg-accent"
  >
    <span className="flex size-9 items-center justify-center rounded-full bg-card text-primary shadow-sm">
      <Icon className="size-5" />
    </span>
    {label}
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
            className="-mt-6 size-14 rounded-full shadow-lg"
            aria-label={translate("ra.action.create")}
          >
            <Plus className="size-7" />
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
