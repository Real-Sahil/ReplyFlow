import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, FileSpreadsheet, Plus, X } from "lucide-react";
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

import { openReceipt } from "../finance/BillsPage";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { useIsClaimant } from "../misc/useIsClaimant";
import {
  byAttention,
  categoryLabel,
  CLAIM_CATEGORIES,
  claimantName,
  duplicateNote,
  findSimilar,
  flaggedCount,
  owedToStaff,
  parsePounds,
  sha256Hex,
  STATUS_LABEL,
  waiting,
  waitingTotal,
  type Claim,
} from "./claims";
import { ImportDialog, TemplateButtons } from "../importer/ImportDialog";
import { claimsSpec } from "../importer/specs";
import { CLAIMS_KEY, useClaims } from "./useClaims";

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "";

const today = () => new Date().toLocaleDateString("en-CA");

const useRefresh = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: CLAIMS_KEY });
    queryClient.invalidateQueries({ queryKey: ["money"] });
  };
};

const StatusChip = ({ status }: { status: Claim["status"] }) => (
  <span
    className={cn(
      "shrink-0 rounded-md px-1.5 py-0.5 text-xs",
      status === "pending" && "bg-warning-soft text-warning",
      status === "approved" && "bg-primary/10 text-primary",
      status === "rejected" && "bg-destructive/10 text-destructive",
      status === "paid" && "text-muted-foreground",
    )}
  >
    {STATUS_LABEL[status]}
  </span>
);

const ReceiptLink = ({ path }: { path: string | null }) =>
  path ? (
    <button
      type="button"
      onClick={() => openReceipt(path)}
      className="text-xs text-primary underline underline-offset-2"
    >
      Receipt
    </button>
  ) : (
    <span className="text-xs text-muted-foreground">No receipt</span>
  );

// ---- The employee's screen: send a claim, see how it went -----------------------------------

const NewClaimDialog = ({ onClose }: { onClose: () => void }) => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const refresh = useRefresh();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("travel_out");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today());
  const [photo, setPhoto] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const { data: mine = [] } = useClaims();

  const pence = parsePounds(amount);
  // Warn before sending something that looks like a claim already sent. Sending anyway is allowed.
  const similar =
    pence !== null && date
      ? findSimilar(mine, { amount_pence: pence, claim_date: date })
      : null;
  const ready =
    pence !== null &&
    description.trim().length > 0 &&
    !!identity &&
    (!similar || confirmed);

  const send = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      let receipt_path: string | null = null;
      let receipt_hash: string | null = null;
      if (photo) {
        receipt_hash = await sha256Hex(photo);
        const { data: org, error: orgError } =
          await client.rpc("my_organisation_id");
        if (orgError || org == null) throw new Error("Please sign in again.");
        const ext = photo.name.includes(".")
          ? `.${photo.name.split(".").pop()}`
          : ".jpg";
        const path = `${org}/claims/${identity?.id}/${crypto.randomUUID()}${ext}`;
        const { error: uploadError } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, photo);
        if (uploadError)
          throw new Error(
            "The photo could not be uploaded. Try a smaller one, or send without it.",
          );
        receipt_path = path;
      }
      const { error } = await client.from("expense_claims").insert({
        claim_date: date,
        amount_pence: pence,
        category,
        description: description.trim(),
        receipt_path,
        receipt_hash,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify("Sent. You will see here when it is approved.");
      refresh();
      onClose();
    },
    onError: (error: Error) =>
      notify(error.message || "That could not be sent.", { type: "error" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New claim</DialogTitle>
          <DialogDescription>
            What did you spend, and what was it for? Add a photo of the receipt
            if you have one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="claim-amount">Amount (£)</Label>
            <Input
              id="claim-amount"
              inputMode="decimal"
              autoFocus
              placeholder="12.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amount && pence === null ? (
              <p className="text-xs text-destructive">
                Enter an amount like 12.50 (up to £5,000).
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="claim-what">What was it for?</Label>
            <Input
              id="claim-what"
              maxLength={300}
              placeholder="Parking at the Reading site"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="claim-cat">Type</Label>
              <select
                id="claim-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {CLAIM_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="claim-date">Date</Label>
              <Input
                id="claim-date"
                type="date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          {similar && (
            <div
              role="status"
              className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm"
            >
              <p className="font-medium">
                This looks like one you already sent
              </p>
              <p className="text-muted-foreground">
                {formatPence(similar.amount_pence)} for “{similar.description}”
                on {day(similar.claim_date)} (
                {STATUS_LABEL[similar.status].toLowerCase()}).
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                It is a different spend, send it
              </label>
            </div>
          )}
          <div>
            <input
              ref={camera}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => camera.current?.click()}
            >
              <Camera className="size-4" />
              {photo
                ? `Photo added: ${photo.name}`
                : "Add a photo of the receipt"}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Sending…" : "Send claim"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MyClaims = ({ claims }: { claims: Claim[] }) => {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const refresh = useRefresh();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title text-2xl font-semibold tracking-tight">
          My expenses
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSheet(true)}>
            <FileSpreadsheet className="size-4" /> Send a sheet
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New claim
          </Button>
        </div>
      </div>
      {claims.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing yet. Tap New claim when you have spent something for the
          business.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
          {claims.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 border-b p-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {day(c.claim_date)} · {categoryLabel(c.category)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatPence(c.amount_pence)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <StatusChip status={c.status} />
                <ReceiptLink path={c.receipt_path} />
              </div>
              {c.status === "rejected" && c.decision_note ? (
                <p className="text-xs text-muted-foreground">
                  Reason: {c.decision_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? <NewClaimDialog onClose={() => setOpen(false)} /> : null}
      {sheet ? (
        <ImportDialog
          spec={claimsSpec()}
          onClose={() => setSheet(false)}
          checkDuplicates={(rows) =>
            rows.map((row) => {
              const same = findSimilar(claims, row);
              return same
                ? `${formatPence(row.amount_pence)} on ${day(row.claim_date)} is close to “${same.description}” (${formatPence(same.amount_pence)} on ${day(same.claim_date)}) that you sent already.`
                : null;
            })
          }
          onImport={async (rows) => {
            const { error } = await getSupabaseClient()
              .from("expense_claims")
              .insert(rows);
            if (error) throw error;
            refresh();
          }}
        />
      ) : null}
    </div>
  );
};

// ---- The administrator's screen: decide, then pay back --------------------------------------

const RejectDialog = ({
  claim,
  onClose,
}: {
  claim: Claim;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [note, setNote] = useState("");
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("decide_expense_claim", {
        p_id: claim.id,
        p_approve: false,
        p_note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Do not approve this claim</DialogTitle>
          <DialogDescription>
            {claimantName(claim)} will see your reason. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Why? For example: personal, not for the business"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!note.trim() || reject.isPending}
            onClick={() => reject.mutate()}
          >
            Not approved
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PayDialog = ({
  claim,
  onClose,
}: {
  claim: Claim;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("bank_transfer");
  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("pay_expense_claim", {
        p_id: claim.id,
        p_date: date,
        p_method: method,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify("Marked as paid and added to the money book.");
      refresh();
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Pay {formatPence(claim.amount_pence)} to {claimantName(claim)}
          </DialogTitle>
          <DialogDescription>
            Make the payment yourself, then record it here. It is added to the
            money book with the receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-date">Paid on</Label>
            <Input
              id="pay-date"
              type="date"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-method">How</Label>
            <select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pay.isPending} onClick={() => pay.mutate()}>
            Mark as paid
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ClaimRow = ({ claim }: { claim: Claim }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [dialog, setDialog] = useState<"reject" | "pay" | null>(null);
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("decide_expense_claim", {
        p_id: claim.id,
        p_approve: true,
        p_note: null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <li className="flex flex-col gap-2 border-b p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{claim.description}</p>
          <p className="text-xs text-muted-foreground">
            {claimantName(claim)} · {day(claim.claim_date)} ·{" "}
            {categoryLabel(claim.category)}
          </p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">
          {formatPence(claim.amount_pence)}
        </p>
      </div>
      {duplicateNote(claim) &&
      (claim.status === "pending" || claim.status === "approved") ? (
        <p
          role="status"
          className="rounded-md bg-warning-soft px-2 py-1 text-xs text-warning"
        >
          {duplicateNote(claim)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <StatusChip status={claim.status} />
          <ReceiptLink path={claim.receipt_path} />
        </div>
        <div className="flex gap-2">
          {claim.status === "pending" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("reject")}
              >
                <X className="size-4" /> No
              </Button>
              <Button
                size="sm"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                <Check className="size-4" />
                {claim.duplicate_of ? "Approve anyway" : "Approve"}
              </Button>
            </>
          ) : null}
          {claim.status === "approved" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("reject")}
              >
                Cancel claim
              </Button>
              <Button size="sm" onClick={() => setDialog("pay")}>
                Mark as paid
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {claim.status === "rejected" && claim.decision_note ? (
        <p className="text-xs text-muted-foreground">
          Reason given: {claim.decision_note}
        </p>
      ) : null}
      {dialog === "reject" ? (
        <RejectDialog claim={claim} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "pay" ? (
        <PayDialog claim={claim} onClose={() => setDialog(null)} />
      ) : null}
    </li>
  );
};

const AllClaims = ({ claims }: { claims: Claim[] }) => (
  <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <div>
      <h1 className="page-title text-2xl font-semibold tracking-tight">
        Staff expenses
      </h1>
      <p className="text-sm text-muted-foreground">
        {waiting(claims).length > 0
          ? `${waiting(claims).length} waiting (${formatPence(waitingTotal(claims))}${flaggedCount(claims) > 0 ? `, ${flaggedCount(claims)} may be duplicates` : ""}). `
          : "Nothing waiting. "}
        {owedToStaff(claims) > 0
          ? `You owe staff ${formatPence(owedToStaff(claims))} for approved claims.`
          : ""}
      </p>
    </div>
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 text-sm shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">A sheet for your staff</span>
        <span className="text-muted-foreground">
          Staff who claim often can fill this in and send it from their own
          sign-in. Each row arrives as a claim for you to approve.
        </span>
      </span>
      <TemplateButtons spec={claimsSpec()} />
    </div>
    {claims.length === 0 ? (
      <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
        No claims yet. Add a team member with the Staff sign-in access on the
        Team page, and give them their sign-in details.
      </p>
    ) : (
      <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {byAttention(claims).map((c) => (
          <ClaimRow key={c.id} claim={c} />
        ))}
      </ul>
    )}
  </div>
);

export const ClaimsPage = () => {
  const claimant = useIsClaimant();
  const { data: claims = [], isPending, isError } = useClaims();
  if (isPending)
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        The claims could not be loaded. Please try again.
      </p>
    );
  return claimant ? (
    <MyClaims claims={claims} />
  ) : (
    <AllClaims claims={claims} />
  );
};
