import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Landmark, Upload } from "lucide-react";
import { useGetIdentity, useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { BILLS_KEY } from "./billTypes";
import {
  parseBankCsv,
  suggestAll,
  type BankRow,
  type Suggestion,
} from "./bankMatch";
import { MONEY_KEY } from "./moneyTypes";
import { OWED_KEY, useOwedByCustomers, useOwedToSuppliers } from "./useOwed";
import {
  BANK_KEY,
  useBankCounts,
  useBankLines,
  type BankLine,
} from "./useBankLines";
import { useMoneyCategories } from "./useMoney";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type Tab = BankLine["status"];

// Drop in a bank statement (CSV), and each line is matched to an invoice a customer owes or a
// supplier bill, or added to the money book, or ignored. Nothing talks to a bank. Matching an
// invoice records the payment on its order, and matching a bill marks it paid, so the rest of the
// system (owed and owing, reports, the accountant's pack) is already right.
export const BankMatchPage = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [adding, setAdding] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    rows: BankRow[];
    fresh: BankRow[];
    skipped: number;
  } | null>(null);

  const { data: counts } = useBankCounts();
  const { data: lines = [], isPending } = useBankLines(tab);
  const { data: owed = [] } = useOwedByCustomers();
  const { data: bills = [] } = useOwedToSuppliers();
  const { data: categories = [] } = useMoneyCategories();

  const suggestions =
    tab === "open"
      ? suggestAll(lines, owed, bills)
      : new Map<number, Suggestion>();

  const refreshAll = () => {
    for (const key of [
      BANK_KEY,
      OWED_KEY,
      BILLS_KEY,
      MONEY_KEY,
      ["order_payments"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const fail = (e: Error) => notify(e.message, { type: "error" });

  const readFile = async (file: File) => {
    const result = parseBankCsv(await file.text());
    if (result.problem) {
      notify(result.problem, { type: "error" });
      return;
    }
    // Lines already imported (statements overlap) are left out.
    const dates = result.rows.map((r) => r.line_date).sort();
    const { data: existing, error } = await getSupabaseClient()
      .from("bank_lines")
      .select("line_hash")
      .gte("line_date", dates[0])
      .lte("line_date", dates[dates.length - 1])
      .limit(5000);
    if (error) return fail(error);
    const have = new Set((existing ?? []).map((r) => r.line_hash as string));
    setPreview({
      rows: result.rows,
      fresh: result.rows.filter((r) => !have.has(r.line_hash)),
      skipped: result.skipped,
    });
  };

  const importLines = useMutation({
    mutationFn: async (rows: BankRow[]) => {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await getSupabaseClient()
          .from("bank_lines")
          .insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      notify("Statement imported", { type: "success" });
      setPreview(null);
      setTab("open");
      refreshAll();
    },
    onError: fail,
  });

  const setStatus = async (id: number, patch: Record<string, unknown>) => {
    const { error } = await getSupabaseClient()
      .from("bank_lines")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  };

  const match = useMutation({
    mutationFn: async ({ line, s }: { line: BankLine; s: Suggestion }) => {
      const client = getSupabaseClient();
      if (s.kind === "customer") {
        const { data, error } = await client
          .from("order_payments")
          .insert({
            order_id: s.order_id,
            kind: "balance",
            amount_pence: line.amount_pence,
            method: "bank_transfer",
            received_at: `${line.line_date}T12:00:00Z`,
            note: `Matched from bank statement: ${line.description}`.slice(
              0,
              300,
            ),
            sales_id: Number(identity?.id) || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        await setStatus(line.id, {
          status: "matched",
          order_payment_id: data.id,
        });
      } else {
        const { error } = await client
          .from("bills")
          .update({
            paid_date: line.line_date,
            payment_method: "bank_transfer",
          })
          .eq("id", s.bill_id);
        if (error) throw error;
        await setStatus(line.id, { status: "matched", bill_id: s.bill_id });
      }
    },
    onSuccess: () => {
      notify("Matched", { type: "success" });
      refreshAll();
    },
    onError: fail,
  });

  const ignore = useMutation({
    mutationFn: (line: BankLine) => setStatus(line.id, { status: "ignored" }),
    onSuccess: refreshAll,
    onError: fail,
  });

  const addEntry = useMutation({
    mutationFn: async (args: {
      line: BankLine;
      category: string;
      note: string;
    }) => {
      const { line, category, note } = args;
      const chosen = categories.find((c) => c.code === category);
      const { data, error } = await getSupabaseClient()
        .from("money_entries")
        .insert({
          direction: line.amount_pence > 0 ? "in" : "out",
          category,
          status: "done",
          entry_date: line.line_date,
          amount_pence: Math.abs(line.amount_pence),
          payment_method: "bank_transfer",
          regulated: chosen?.regulated ?? false,
          vat_code: "O",
          vat_pence: 0,
          note: note.trim(),
        })
        .select("id")
        .single();
      if (error) throw error;
      await setStatus(line.id, { status: "matched", money_entry_id: data.id });
    },
    onSuccess: () => {
      notify("Added to the money book", { type: "success" });
      setAdding(null);
      refreshAll();
    },
    onError: fail,
  });

  const total =
    (counts?.open ?? 0) + (counts?.matched ?? 0) + (counts?.ignored ?? 0);

  return (
    <div className="mt-2 flex flex-col gap-5 px-4 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title flex min-w-0 basis-full items-center gap-2 text-2xl font-semibold tracking-tight sm:basis-0 sm:flex-1">
          <Landmark className="size-6 text-muted-foreground" /> Bank match
        </h1>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          <Upload /> Add a bank statement
        </Button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-sm">
            <b>{preview.rows.length}</b> lines in the file,{" "}
            <b>{preview.fresh.length}</b> new
            {preview.rows.length - preview.fresh.length > 0
              ? `, ${preview.rows.length - preview.fresh.length} already imported`
              : ""}
            {preview.skipped > 0
              ? `, ${preview.skipped} rows could not be read and were left out`
              : ""}
            .
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={preview.fresh.length === 0 || importLines.isPending}
              onClick={() => importLines.mutate(preview.fresh)}
            >
              Import {preview.fresh.length} new lines
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreview(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Bank lines"
      >
        {(
          [
            ["open", "To match"],
            ["matched", "Matched"],
            ["ignored", "Ignored"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {label} ({counts?.[key] ?? 0})
          </button>
        ))}
        {total > 0 ? (
          <span className="self-center px-1 text-sm text-muted-foreground">
            {total - (counts?.open ?? 0)} of {total} done
          </span>
        ) : null}
      </div>

      <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
        {isPending ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {tab === "open"
              ? total === 0
                ? "Download a statement from your bank as a CSV file and add it here. Each line is matched to an invoice or a bill, or you can add it to the money book."
                : "Everything is matched. Nice."
              : "Nothing here."}
          </p>
        ) : (
          lines.map((line) => {
            const s = suggestions.get(line.id);
            const isIn = line.amount_pence > 0;
            return (
              <div key={line.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">
                    {day(line.line_date)}
                  </span>
                  <span className="min-w-0 flex-1 basis-48 break-words text-sm">
                    {line.description}
                  </span>
                  <span
                    className={cn(
                      "w-28 text-right text-sm font-semibold tabular-nums",
                      isIn ? "text-success" : "text-foreground",
                    )}
                  >
                    {isIn ? "+" : "−"}
                    {formatPence(Math.abs(line.amount_pence))}
                  </span>
                </div>
                {tab === "open" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {s ? (
                      <Button
                        size="sm"
                        disabled={match.isPending}
                        onClick={() => match.mutate({ line, s })}
                      >
                        <Check />
                        {s.kind === "customer"
                          ? `Paid: ${s.label}`
                          : `Pays bill: ${s.label}`}
                        {s.strong ? "" : " (check)"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAdding(adding === line.id ? null : line.id)
                      }
                    >
                      Add to money book
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ignore.isPending}
                      onClick={() => ignore.mutate(line)}
                    >
                      Ignore
                    </Button>
                  </div>
                ) : null}
                {adding === line.id ? (
                  <AddEntry
                    line={line}
                    categories={categories.filter(
                      (c) =>
                        c.direction === (isIn ? "in" : "out") && !c.admin_only,
                    )}
                    busy={addEntry.isPending}
                    onAdd={(category, note) =>
                      addEntry.mutate({ line, category, note })
                    }
                  />
                ) : null}
                {tab !== "open" && line.note ? (
                  <p className="text-xs text-muted-foreground">{line.note}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const AddEntry = ({
  line,
  categories,
  busy,
  onAdd,
}: {
  line: BankLine;
  categories: { code: string; label: string; grp: string }[];
  busy: boolean;
  onAdd: (category: string, note: string) => void;
}) => {
  const [category, setCategory] = useState(categories[0]?.code ?? "");
  const [note, setNote] = useState(line.description);
  const ok = !!category && note.trim().length >= 3;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/50 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Category
        <select
          className="h-9 rounded-md border bg-card px-2 text-sm text-foreground"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Note (appears in reports)
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button
        size="sm"
        disabled={!ok || busy}
        onClick={() => onAdd(category, note)}
      >
        Add
      </Button>
    </div>
  );
};
