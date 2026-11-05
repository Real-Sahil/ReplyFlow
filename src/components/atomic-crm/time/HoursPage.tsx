import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Plus, X } from "lucide-react";
import { useGetIdentity, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { todayIso } from "../importer/engine";
import { useIsClaimant } from "../misc/useIsClaimant";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { DecisionDialog } from "./DecisionDialog";
import {
  STATUS_LABEL,
  hoursLabel,
  parseHours,
  staffName,
  waitingByPerson,
  weekStart,
  weeklyTotals,
  type TimeEntry,
} from "./time";
import { TIME_KEY, useTimeEntries } from "./useTime";

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const Chip = ({ status }: { status: TimeEntry["status"] }) => (
  <span
    className={cn(
      "shrink-0 rounded-md px-1.5 py-0.5 text-xs",
      status === "pending" && "bg-warning-soft text-warning",
      status === "approved" && "bg-primary/10 text-primary",
      status === "rejected" && "bg-destructive/10 text-destructive",
    )}
  >
    {STATUS_LABEL[status]}
  </span>
);

const AddHoursDialog = ({ onClose }: { onClose: () => void }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const parsed = parseHours(hours);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("time_entries")
        .insert({ work_date: date, hours: parsed, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIME_KEY });
      notify("Sent. You will see here when it is approved.");
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add hours</DialogTitle>
          <DialogDescription>
            How long did you work? Type 7.5, 7:30 or 7h30.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="h-date">Day</Label>
            <Input
              id="h-date"
              type="date"
              max={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="h-hours">Hours</Label>
            <Input
              id="h-hours"
              autoFocus
              inputMode="decimal"
              placeholder="7.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="h-note">What you did (optional)</Label>
            <Input
              id="h-note"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        {hours && parsed === null ? (
          <p className="text-xs text-destructive">
            Enter the hours like 7.5 or 7:30, up to 24.
          </p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={parsed === null || !date || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MyHours = ({ entries }: { entries: TimeEntry[] }) => {
  const [open, setOpen] = useState(false);
  const thisWeek = weekStart(todayIso());
  const sofar = entries
    .filter(
      (e) => weekStart(e.work_date) === thisWeek && e.status !== "rejected",
    )
    .reduce((s, e) => s + Number(e.hours), 0);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My hours</h1>
          <p className="text-sm text-muted-foreground">
            This week so far: {hoursLabel(sofar)}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add hours
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing yet. Tap Add hours at the end of a shift.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-1 border-b p-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{day(e.work_date)}</p>
                  {e.note ? (
                    <p className="text-sm text-muted-foreground">{e.note}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {hoursLabel(Number(e.hours))}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Chip status={e.status} />
              </div>
              {e.status === "rejected" && e.decision_note ? (
                <p className="text-xs text-muted-foreground">
                  Reason: {e.decision_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? <AddHoursDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
};

const AllHours = ({ entries }: { entries: TimeEntry[] }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState<number[] | null>(null);
  const decide = useMutation({
    mutationFn: async ({
      ids,
      approve,
      note,
    }: {
      ids: number[];
      approve: boolean;
      note?: string;
    }) => {
      const { error } = await getSupabaseClient().rpc("decide_time_entries", {
        p_ids: ids,
        p_approve: approve,
        p_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIME_KEY });
      setRefusing(null);
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const groups = waitingByPerson(entries);
  const waitingCount = groups.reduce((s, g) => s + g.entries.length, 0);
  const byPerson = new Map<number, { name: string; entries: TimeEntry[] }>();
  for (const e of entries) {
    if (e.status !== "approved") continue;
    const g = byPerson.get(e.staff_id) ?? { name: staffName(e), entries: [] };
    g.entries.push(e);
    byPerson.set(e.staff_id, g);
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Clock className="size-6 text-muted-foreground" /> Staff hours
        </h1>
        <p className="text-sm text-muted-foreground">
          {groups.length > 0
            ? `${waitingCount} ${waitingCount === 1 ? "entry" : "entries"} waiting for you.`
            : "Nothing waiting."}{" "}
          Hours are records only: nothing here works out pay.
        </p>
      </div>
      {groups.map((g) => (
        <section
          key={g.staffId}
          className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div>
              <p className="font-medium">{g.name}</p>
              <p className="text-xs text-muted-foreground">
                {hoursLabel(g.hours)} waiting
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefusing(g.entries.map((e) => e.id))}
              >
                <X className="size-4" /> Not approved
              </Button>
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    ids: g.entries.map((e) => e.id),
                    approve: true,
                  })
                }
              >
                <Check className="size-4" /> Approve all
              </Button>
            </div>
          </div>
          <ul>
            {g.entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p>{day(e.work_date)}</p>
                  {e.note ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {e.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">
                    {hoursLabel(Number(e.hours))}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRefusing([e.id])}
                  >
                    No
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ ids: [e.id], approve: true })
                    }
                  >
                    Yes
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {byPerson.size > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Approved, by week
          </h2>
          <div className="flex flex-col gap-3">
            {[...byPerson.values()].map((p) => (
              <div
                key={p.name}
                className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <p className="font-medium">{p.name}</p>
                <ul className="mt-1 text-sm">
                  {weeklyTotals(p.entries)
                    .slice(0, 6)
                    .map((w) => (
                      <li
                        key={w.week}
                        className="flex justify-between border-b py-1.5 last:border-b-0"
                      >
                        <span className="text-muted-foreground">
                          Week of {day(w.week)}
                        </span>
                        <span className="tabular-nums">
                          {hoursLabel(w.hours)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {entries.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          No hours yet. Staff with a sign-in can add theirs from their phone.
        </p>
      ) : null}
      {refusing ? (
        <DecisionDialog
          title="Do not approve these hours"
          description="They will see your reason. Nothing is deleted."
          pending={decide.isPending}
          onClose={() => setRefusing(null)}
          onConfirm={(note) =>
            decide.mutate({ ids: refusing, approve: false, note })
          }
        />
      ) : null}
    </div>
  );
};

export const HoursPage = () => {
  const claimant = useIsClaimant();
  const { identity } = useGetIdentity();
  const allowed = claimant || !!identity?.administrator;
  const { data: entries = [], isPending, isError } = useTimeEntries(allowed);
  if (!identity) return null;
  if (!allowed)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );
  if (isPending)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This could not be loaded. Please try again.
      </p>
    );
  return claimant ? (
    <MyHours entries={entries} />
  ) : (
    <AllHours entries={entries} />
  );
};
