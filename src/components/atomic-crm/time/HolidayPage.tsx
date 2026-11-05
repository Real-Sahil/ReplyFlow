import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Palmtree, Plus, X } from "lucide-react";
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
import { workingDays } from "../people/people";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { DecisionDialog } from "./DecisionDialog";
import { STATUS_LABEL, clashes, staffName, type HolidayRequest } from "./time";
import { HOLIDAY_KEY, useHolidayRequests } from "./useTime";

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const range = (r: HolidayRequest) =>
  r.from_date === r.to_date
    ? day(r.from_date)
    : `${day(r.from_date)} to ${day(r.to_date)}`;

const Chip = ({ status }: { status: HolidayRequest["status"] }) => (
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

const RequestDialog = ({ onClose }: { onClose: () => void }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const suggested = workingDays(from, to);
  const value = days.trim() === "" ? suggested : Number(days);
  const valid = !!from && !!to && to >= from && value > 0 && value <= 60;
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("holiday_requests")
        .insert({
          from_date: from,
          to_date: to,
          days: value,
          note: note.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HOLIDAY_KEY });
      notify("Sent. You will see here when it is approved.");
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask for holiday</DialogTitle>
          <DialogDescription>
            Pick the first and last day. Weekdays are counted for you; change
            the days if you need to.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hr-from">First day</Label>
            <Input
              id="hr-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hr-to">Last day</Label>
            <Input
              id="hr-to"
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hr-days">Days of holiday</Label>
            <Input
              id="hr-days"
              inputMode="decimal"
              placeholder={String(suggested)}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hr-note">Note (optional)</Label>
            <Input
              id="hr-note"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending
              ? "Sending…"
              : `Ask for ${value || 0} day${value === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MyHoliday = ({ requests }: { requests: HolidayRequest[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My holiday</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Ask for holiday
        </Button>
      </div>
      {requests.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          No requests yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 border-b p-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{range(r)}</p>
                  {r.note ? (
                    <p className="text-sm text-muted-foreground">{r.note}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {Number(r.days)} day{Number(r.days) === 1 ? "" : "s"}
                </p>
              </div>
              <div>
                <Chip status={r.status} />
              </div>
              {r.status === "rejected" && r.decision_note ? (
                <p className="text-xs text-muted-foreground">
                  Reason: {r.decision_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? <RequestDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
};

// The staff sign-ins that are linked to a person in People. Approved holiday for anyone else is not added to
// a person's leave, so the administrator is reminded.
const useLinkedSignIns = (): Set<number> | null => {
  const { data } = useQuery({
    queryKey: ["people", "linked_sign_ins"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("people")
        .select("sales_id")
        .eq("active", true)
        .not("sales_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((p) => Number(p.sales_id)));
    },
  });
  return data ?? null;
};

const AllHoliday = ({ requests }: { requests: HolidayRequest[] }) => {
  const linked = useLinkedSignIns();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState<HolidayRequest | null>(null);
  const decide = useMutation({
    mutationFn: async ({
      id,
      approve,
      note,
    }: {
      id: number;
      approve: boolean;
      note?: string;
    }) => {
      const { error } = await getSupabaseClient().rpc(
        "decide_holiday_request",
        { p_id: id, p_approve: approve, p_note: note ?? null },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HOLIDAY_KEY });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setRefusing(null);
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const waiting = requests
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  const booked = requests
    .filter((r) => r.status === "approved" && r.to_date >= todayIso())
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="page-title flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Palmtree className="size-6 text-muted-foreground" /> Staff holiday
        </h1>
        <p className="text-sm text-muted-foreground">
          {waiting.length > 0
            ? `${waiting.length} waiting for you.`
            : "Nothing waiting."}{" "}
          An approved request is added to the person's leave when their sign-in
          is linked to them in People.
        </p>
      </div>
      {waiting.map((r) => {
        const clash = clashes(r, requests);
        return (
          <section
            key={r.id}
            className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{staffName(r)}</p>
                <p className="text-sm text-muted-foreground">
                  {range(r)} · {Number(r.days)} day
                  {Number(r.days) === 1 ? "" : "s"}
                </p>
                {r.note ? <p className="text-sm">{r.note}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRefusing(r)}
                >
                  <X className="size-4" /> No
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, approve: true })}
                >
                  <Check className="size-4" /> Approve
                </Button>
              </div>
            </div>
            {linked && !linked.has(Number(r.staff_id)) ? (
              <p
                role="status"
                className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {staffName(r)}'s sign-in is not linked to a person in People, so
                approving this will not reduce their holiday allowance.
              </p>
            ) : null}
            {clash.length > 0 ? (
              <p
                role="status"
                className="mt-2 rounded-md bg-warning-soft px-2 py-1 text-xs text-warning"
              >
                Also off in that time: {clash.map(staffName).join(", ")}.
              </p>
            ) : null}
          </section>
        );
      })}
      {booked.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Booked off, coming up
          </h2>
          <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            {booked.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0"
              >
                <span>{staffName(r)}</span>
                <span className="text-muted-foreground">{range(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {requests.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          No requests yet. Staff with a sign-in can ask for holiday from their
          phone.
        </p>
      ) : null}
      {refusing ? (
        <DecisionDialog
          title={`Do not approve ${staffName(refusing)}'s holiday`}
          description="They will see your reason. Nothing is deleted."
          pending={decide.isPending}
          onClose={() => setRefusing(null)}
          onConfirm={(note) =>
            decide.mutate({ id: refusing.id, approve: false, note })
          }
        />
      ) : null}
    </div>
  );
};

export const HolidayPage = () => {
  const claimant = useIsClaimant();
  const { identity } = useGetIdentity();
  const allowed = claimant || !!identity?.administrator;
  const {
    data: requests = [],
    isPending,
    isError,
  } = useHolidayRequests(allowed);
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
    <MyHoliday requests={requests} />
  ) : (
    <AllHoliday requests={requests} />
  );
};
