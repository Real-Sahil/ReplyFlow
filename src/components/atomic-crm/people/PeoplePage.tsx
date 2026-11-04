import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, FilePlus, Pencil, Plus, UserRound } from "lucide-react";
import { useNotify } from "ra-core";

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

import { openReceipt } from "../finance/BillsPage";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { storagePath } from "../providers/supabase/organisationFolder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  expiryLabel,
  expiryState,
  holidayRemaining,
  payLabel,
  workingDays,
  type Leave,
  type Person,
  type PersonDocument,
} from "./people";
import {
  PEOPLE_KEY,
  usePeople,
  usePersonDocuments,
  usePersonLeave,
} from "./usePeople";

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const today = () => new Date().toLocaleDateString("en-CA");

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

const useSave = (message: string, onDone: () => void) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  return {
    notify,
    done: () => {
      notify(message, { type: "success" });
      void queryClient.invalidateQueries({ queryKey: PEOPLE_KEY });
      onDone();
    },
    fail: (e: Error) => notify(e.message, { type: "error" }),
  };
};

const PersonDialog = ({
  person,
  onClose,
}: {
  person?: Person;
  onClose: () => void;
}) => {
  const s = useSave(person ? "Person updated" : "Person added", onClose);
  const [name, setName] = useState(person?.full_name ?? "");
  const [kind, setKind] = useState<Person["kind"]>(person?.kind ?? "employee");
  const [role, setRole] = useState(person?.role_title ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [start, setStart] = useState(person?.start_date ?? "");
  const [end, setEnd] = useState(person?.end_date ?? "");
  const [rate, setRate] = useState(
    person?.pay_rate_pence != null
      ? (person.pay_rate_pence / 100).toFixed(2)
      : "",
  );
  const [basis, setBasis] = useState<string>(person?.pay_basis ?? "hour");
  const [allowance, setAllowance] = useState(
    String(person?.holiday_allowance_days ?? 28),
  );
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [active, setActive] = useState(person?.active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        full_name: name.trim(),
        kind,
        role_title: role.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        start_date: start || null,
        end_date: end || null,
        pay_rate_pence:
          rate.trim() === "" ? null : Math.round(Number(rate) * 100),
        pay_basis: rate.trim() === "" ? null : basis,
        holiday_allowance_days: Number(allowance) || 0,
        notes: notes.trim() || null,
        active,
      };
      const client = getSupabaseClient();
      const { error } = person
        ? await client.from("people").update(row).eq("id", person.id)
        : await client.from("people").insert(row);
      if (error) throw error;
    },
    onSuccess: s.done,
    onError: s.fail,
  });
  const valid =
    name.trim().length > 0 &&
    (rate.trim() === "" || Number(rate) >= 0) &&
    Number(allowance) >= 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add a person"}</DialogTitle>
          <DialogDescription>
            Staff and contractors. Only administrators can see this page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="pe-name" label="Full name">
              <Input
                id="pe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Field id="pe-kind" label="Works as">
            <select
              id="pe-kind"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as Person["kind"])}
            >
              <option value="employee">Employee</option>
              <option value="contractor">Contractor</option>
            </select>
          </Field>
          <Field id="pe-role" label="Job title (optional)">
            <Input
              id="pe-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </Field>
          <Field id="pe-phone" label="Phone (optional)">
            <Input
              id="pe-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field id="pe-email" label="Email (optional)">
            <Input
              id="pe-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="pe-start" label="Started (optional)">
            <Input
              id="pe-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field id="pe-end" label="Left (optional)">
            <Input
              id="pe-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field id="pe-rate" label="Pay rate in pounds (optional)">
            <Input
              id="pe-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field id="pe-basis" label="Per">
            <select
              id="pe-basis"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            >
              {["hour", "day", "week", "month", "year", "job"].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          {kind === "employee" ? (
            <Field id="pe-allow" label="Holiday days a year">
              <Input
                id="pe-allow"
                inputMode="decimal"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
              />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Still works here
          </label>
          <div className="sm:col-span-2">
            <Field id="pe-notes" label="Notes (optional)">
              <Input
                id="pe-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DocumentDialog = ({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) => {
  const s = useSave("Document added", onClose);
  const [title, setTitle] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      let file_path: string | null = null;
      if (file) {
        const ext = file.name.includes(".")
          ? `.${file.name.split(".").pop()}`
          : "";
        const path = await storagePath(`${crypto.randomUUID()}${ext}`);
        const { error: uploadError } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, file);
        if (uploadError) throw new Error("The file could not be uploaded.");
        file_path = path;
      }
      const { error } = await client.from("person_documents").insert({
        person_id: person.id,
        title: title.trim(),
        issued_on: issued || null,
        expires_on: expires || null,
        note: note.trim() || null,
        file_path,
      });
      if (error) throw error;
    },
    onSuccess: s.done,
    onError: s.fail,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a document for {person.full_name}</DialogTitle>
          <DialogDescription>
            A right-to-work check, a licence, insurance, a certificate. Set an
            expiry to be reminded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="doc-title" label="What it is">
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </div>
          <Field id="doc-issued" label="Issued (optional)">
            <Input
              id="doc-issued"
              type="date"
              value={issued}
              onChange={(e) => setIssued(e.target.value)}
            />
          </Field>
          <Field id="doc-expires" label="Expires (optional)">
            <Input
              id="doc-expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="doc-note" label="Note (optional)">
              <Input
                id="doc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="doc-file" label="Copy of the document (optional)">
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LeaveDialog = ({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) => {
  const s = useSave("Leave recorded", onClose);
  const [kind, setKind] = useState<Leave["kind"]>("holiday");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [daysText, setDaysText] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const days = daysText ?? String(workingDays(from, to) || "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("person_leave")
        .insert({
          person_id: person.id,
          kind,
          from_date: from,
          to_date: to,
          days: Number(days),
          note: note.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: s.done,
    onError: s.fail,
  });
  const valid = !!from && !!to && to >= from && Number(days) > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record leave for {person.full_name}</DialogTitle>
          <DialogDescription>
            Holiday, sickness or other time off.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="lv-kind" label="Type">
            <select
              id="lv-kind"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as Leave["kind"])}
            >
              <option value="holiday">Holiday</option>
              <option value="sick">Sickness</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field id="lv-days" label="Working days">
            <Input
              id="lv-days"
              inputMode="decimal"
              value={days}
              onChange={(e) => setDaysText(e.target.value)}
            />
          </Field>
          <Field id="lv-from" label="From">
            <Input
              id="lv-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setDaysText(null);
              }}
            />
          </Field>
          <Field id="lv-to" label="To">
            <Input
              id="lv-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setDaysText(null);
              }}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="lv-note" label="Note (optional)">
              <Input
                id="lv-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            Record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PersonCard = ({
  person,
  documents,
  leave,
}: {
  person: Person;
  documents: PersonDocument[];
  leave: Leave[];
}) => {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"edit" | "document" | "leave" | null>(
    null,
  );
  const now = new Date();
  const mine = documents.filter((d) => d.person_id === person.id && d.active);
  const attention = mine.filter((d) =>
    ["expired", "soon"].includes(expiryState(d.expires_on, now)),
  );
  const theirLeave = leave.filter((l) => l.person_id === person.id);
  const remaining = holidayRemaining(
    person.holiday_allowance_days,
    theirLeave,
    now.getFullYear(),
  );

  const patch = useMutation({
    mutationFn: async (args: {
      table: "person_documents" | "person_leave";
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const { error } = await getSupabaseClient()
        .from(args.table)
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]",
        !person.active && "opacity-70",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="press flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1 basis-48">
          <span className="block text-[15px] font-medium">
            {person.full_name}
            {!person.active ? (
              <span className="ml-2 text-xs text-muted-foreground">(left)</span>
            ) : null}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {[
              person.kind === "contractor" ? "Contractor" : "Employee",
              person.role_title,
              person.phone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {attention.length > 0 ? (
          <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
            {attention.length} document{attention.length === 1 ? "" : "s"} need
            attention
          </span>
        ) : null}
        {person.kind === "employee" ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {remaining} holiday days left
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{payLabel(person)}</span>
            {person.email ? (
              <span className="text-muted-foreground">· {person.email}</span>
            ) : null}
            {person.start_date ? (
              <span className="text-muted-foreground">
                · started {day(person.start_date)}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setDialog("edit")}
            >
              <Pencil /> Edit
            </Button>
          </div>
          {person.notes ? (
            <p className="text-sm text-muted-foreground">{person.notes}</p>
          ) : null}

          <section className="flex flex-col gap-2" aria-label="Documents">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold text-muted-foreground">
                Documents
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("document")}
              >
                <FilePlus /> Add
              </Button>
            </div>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            ) : (
              mine.map((d) => {
                const state = expiryState(d.expires_on, now);
                return (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="min-w-0 flex-1 basis-40 font-medium">
                      {d.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs",
                        state === "expired" &&
                          "bg-destructive/10 text-destructive",
                        state === "soon" && "bg-warning-soft text-warning",
                        (state === "ok" || state === "none") &&
                          "text-muted-foreground",
                      )}
                    >
                      {expiryLabel(d.expires_on, now)}
                    </span>
                    {d.file_path ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void openReceipt(d.file_path!)}
                      >
                        Open
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        patch.mutate({
                          table: "person_documents",
                          id: d.id,
                          patch: { active: false },
                        })
                      }
                    >
                      No longer current
                    </Button>
                  </div>
                );
              })
            )}
          </section>

          <section className="flex flex-col gap-2" aria-label="Leave">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold text-muted-foreground">
                Holiday and absence
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("leave")}
              >
                <CalendarPlus /> Record
              </Button>
            </div>
            {theirLeave.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded.</p>
            ) : (
              theirLeave.slice(0, 12).map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
                    l.voided_at && "line-through opacity-60",
                  )}
                >
                  <span className="w-40">
                    {day(l.from_date)}
                    {l.to_date !== l.from_date ? ` to ${day(l.to_date)}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {l.kind === "holiday"
                      ? "Holiday"
                      : l.kind === "sick"
                        ? "Sickness"
                        : "Other"}
                    , {l.days} day{Number(l.days) === 1 ? "" : "s"}
                  </span>
                  {l.note ? (
                    <span className="text-muted-foreground">{l.note}</span>
                  ) : null}
                  {!l.voided_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() =>
                        patch.mutate({
                          table: "person_leave",
                          id: l.id,
                          patch: { voided_at: new Date().toISOString() },
                        })
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {dialog === "edit" ? (
        <PersonDialog person={person} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "document" ? (
        <DocumentDialog person={person} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "leave" ? (
        <LeaveDialog person={person} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
};

// Staff and contractors: contact details, pay, holiday left, and documents with expiry reminders.
export const PeoplePage = () => {
  const [adding, setAdding] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const { data: people = [], isPending, error } = usePeople();
  const { data: documents = [] } = usePersonDocuments();
  const { data: leave = [] } = usePersonLeave();
  const shown = people.filter((p) => showLeft || p.active);

  return (
    <div className="mt-2 flex flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <UserRound className="size-6 text-muted-foreground" /> People
        </h1>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add a person
        </Button>
      </div>

      {error ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Only administrators can see this page.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          No one added yet. Add your staff and contractors to keep their
          details, documents and holiday in one place.
        </p>
      ) : (
        shown.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            documents={documents}
            leave={leave}
          />
        ))
      )}

      {people.some((p) => !p.active) ? (
        <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showLeft}
            onChange={(e) => setShowLeft(e.target.checked)}
          />
          Show people who have left
        </label>
      ) : null}

      {adding ? <PersonDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
};
