import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Wrench } from "lucide-react";
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

import { parseDate, parsePence, todayIso } from "../importer/engine";
import { expiryState } from "../people/people";
import { usePeople } from "../people/usePeople";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import {
  ASSET_KIND_LABEL,
  assetsNeedingAttention,
  dueLabel,
  markServiced,
  totalCost,
  type Asset,
  type AssetKind,
} from "./paperwork";
import { PAPERWORK_KEY, useAssets } from "./usePaperwork";

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const AssetDialog = ({
  asset,
  onClose,
}: {
  asset?: Asset;
  onClose: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: people = [] } = usePeople();
  const [name, setName] = useState(asset?.name ?? "");
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? "equipment");
  const [identifier, setIdentifier] = useState(asset?.identifier ?? "");
  const [holder, setHolder] = useState(
    asset?.holder_person_id ? String(asset.holder_person_id) : "",
  );
  const [bought, setBought] = useState(asset?.purchase_date ?? "");
  const [cost, setCost] = useState(
    asset?.cost_pence != null ? (asset.cost_pence / 100).toFixed(2) : "",
  );
  const [every, setEvery] = useState(
    asset?.service_every_months ? String(asset.service_every_months) : "",
  );
  const [next, setNext] = useState(asset?.next_service_date ?? "");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [active, setActive] = useState(asset?.active ?? true);

  const costPence =
    cost.trim() === ""
      ? null
      : parsePence(cost, { max: 100_000_000_000, allowZero: true });
  const valid =
    name.trim().length > 0 &&
    (cost.trim() === "" || costPence !== null) &&
    (every.trim() === "" || (Number(every) >= 1 && Number(every) <= 120)) &&
    (next === "" || !!parseDate(next));

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: name.trim(),
        kind,
        identifier: identifier.trim() || null,
        holder_person_id: holder ? Number(holder) : null,
        purchase_date: bought ? parseDate(bought) : null,
        cost_pence: costPence,
        service_every_months: every.trim() === "" ? null : Number(every),
        next_service_date: next ? parseDate(next) : null,
        notes: notes.trim() || null,
        active,
      };
      const client = getSupabaseClient();
      const { error } = asset
        ? await client.from("assets").update(row).eq("id", asset.id)
        : await client.from("assets").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAPERWORK_KEY });
      onClose();
    },
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  const select = "h-9 rounded-md border bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {asset ? "Change this item" : "Add equipment or a vehicle"}
          </DialogTitle>
          <DialogDescription>
            Who has it, what it cost and when it is next due a service or test.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="as-name">Name</Label>
            <Input
              id="as-name"
              autoFocus
              placeholder="Transit van"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-kind">Type</Label>
            <select
              id="as-kind"
              className={select}
              value={kind}
              onChange={(e) => setKind(e.target.value as AssetKind)}
            >
              {(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => (
                <option key={k} value={k}>
                  {ASSET_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-id">
              {kind === "vehicle" ? "Registration" : "Serial number"}
            </Label>
            <Input
              id="as-id"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-holder">Held by</Label>
            <select
              id="as-holder"
              className={select}
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
            >
              <option value="">Nobody in particular</option>
              {people
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-bought">Bought on</Label>
            <Input
              id="as-bought"
              type="date"
              value={bought}
              onChange={(e) => setBought(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-cost">Cost (£)</Label>
            <Input
              id="as-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-every">Serviced every (months)</Label>
            <Input
              id="as-every"
              inputMode="numeric"
              placeholder="12"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="as-next">Next service or test due</Label>
            <Input
              id="as-next"
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="as-notes">Notes</Label>
            <Input
              id="as-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {asset ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Still in use (untick when sold or scrapped)
            </label>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AssetRow = ({
  asset,
  holderName,
  onEdit,
}: {
  asset: Asset;
  holderName: string | null;
  onEdit: () => void;
}) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const today = new Date();
  const state = expiryState(asset.next_service_date, today);
  const serviced = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("assets")
        .update(markServiced(asset, todayIso()))
        .eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAPERWORK_KEY }),
    onError: (error: Error) => notify(error.message, { type: "error" }),
  });
  return (
    <li className="flex flex-col gap-1 border-b p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{asset.name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              ASSET_KIND_LABEL[asset.kind],
              asset.identifier,
              holderName ? `Held by ${holderName}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {asset.cost_pence != null ? (
          <p className="shrink-0 text-sm tabular-nums">
            {formatPence(asset.cost_pence)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-xs",
            state === "expired" && "bg-destructive/10 text-destructive",
            state === "soon" && "bg-warning-soft text-warning",
            (state === "ok" || state === "none") && "text-muted-foreground",
          )}
        >
          {asset.next_service_date
            ? `${dueLabel(asset.next_service_date, today)} · ${day(asset.next_service_date)}`
            : "No service date"}
          {asset.last_service_date
            ? ` · last ${day(asset.last_service_date)}`
            : ""}
        </span>
        <div className="flex gap-1">
          {asset.active && asset.next_service_date ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={serviced.isPending}
              onClick={() => serviced.mutate()}
            >
              Serviced today
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Change
          </Button>
        </div>
      </div>
    </li>
  );
};

export const AssetsPage = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!identity?.administrator;
  const { data: assets = [], isPending, isError } = useAssets(isAdmin);
  const { data: people = [] } = usePeople(isAdmin);
  const [dialog, setDialog] = useState<"new" | Asset | null>(null);
  if (!identity) return null;
  if (!isAdmin)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Only administrators can see this page.
      </p>
    );

  const today = new Date();
  const due = assetsNeedingAttention(assets, today);
  const inUse = assets.filter((a) => a.active);
  const old = assets.filter((a) => !a.active);
  const nameOf = (id: number | null) =>
    people.find((p) => p.id === id)?.full_name ?? null;
  return (
    <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-4 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Truck className="size-6 text-muted-foreground" /> Equipment
        </h1>
        <Button size="sm" onClick={() => setDialog("new")}>
          <Plus /> Add an item
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Vans, tools, computers and phones: who has them, what they cost and when
        they are next due a service or test.{" "}
        {inUse.length > 0
          ? `${inUse.length} in use, ${formatPence(totalCost(assets))} at cost.`
          : ""}
      </p>
      {due.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-warning/50 bg-warning-soft p-3 text-sm"
        >
          <Wrench className="mt-0.5 size-5 shrink-0 text-warning" />
          <p>
            {due.length === 1
              ? `${due[0].name} is due a service or test soon.`
              : `${due.length} items are due a service or test soon.`}
          </p>
        </div>
      ) : null}
      {isError ? (
        <p className="text-sm text-muted-foreground">
          This could not be loaded. Please try again.
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Nothing here yet. Start with your van or your main tools.
        </p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            {inUse.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                holderName={nameOf(a.holder_person_id)}
                onEdit={() => setDialog(a)}
              />
            ))}
          </ul>
          {old.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                No longer in use ({old.length})
              </summary>
              <ul className="mt-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
                {old.map((a) => (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    holderName={nameOf(a.holder_person_id)}
                    onEdit={() => setDialog(a)}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {dialog ? (
        <AssetDialog
          asset={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
};
