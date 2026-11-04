import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { useCanAccess } from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { downloadCsv, toCsv } from "../exports/csv";
import { fetchAllRows } from "../exports/exportPaging";
import { periodBounds, type PeriodPreset } from "../exports/periods";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { formatPence } from "../quotes/quoteMath";
import { downloadCashBookPdf, type CashRow } from "./cashBookPdf";
import {
  bankFile,
  type BankScope,
  type EntryRow,
  quickbooksBills,
  quickbooksSales,
  readiness,
  sage50,
  vatWorkings,
  xeroBills,
  xeroSales,
  type BillRow,
  type Csv,
  type SalesRow,
  type Software,
} from "./accountantPack";
import { useBusinessSettings } from "./useBusinessSettings";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months (a VAT quarter)" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const SOFTWARE: { value: Software; label: string }[] = [
  { value: "xero", label: "Xero" },
  { value: "quickbooks", label: "QuickBooks Online" },
  { value: "sage50", label: "Sage 50" },
];

const fetchRows = <T,>(
  table: string,
  dateColumn: string,
  range: { from: string | null; to: string | null },
  order: string,
) =>
  fetchAllRows<T>(async (start, end) => {
    let query = getSupabaseClient().from(table).select("*");
    if (range.from) query = query.gte(dateColumn, range.from);
    if (range.to) query = query.lte(dateColumn, range.to);
    const response = await query
      .order(dateColumn, { ascending: true })
      .order(order, { ascending: true })
      .range(start, end);
    return {
      data: (response.data ?? null) as unknown as T[] | null,
      error: response.error,
    };
  });

// Everything an accountant needs for a period, in one place: what to fix first, the VAT boxes,
// and one download for each file in the layout of the accountant's software. Nothing is filed or
// sent anywhere; these are files to hand over.
export const AccountantPackPage = () => {
  const [preset, setPreset] = useState<PeriodPreset>("last_3_months");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [software, setSoftware] = useState<Software>("xero");
  const [scope, setScope] = useState<BankScope>("entries");
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });
  const range = periodBounds(preset, { from, to });
  const { data: settings } = useBusinessSettings();

  const { data, isPending, error } = useQuery({
    queryKey: ["accountant_pack", range],
    queryFn: async () => {
      const [sales, bills, entries, cash] = await Promise.all([
        fetchRows<SalesRow>("invoice_ledger", "tax_point", range, "number"),
        fetchRows<BillRow>("bill_ledger", "bill_date", range, "id"),
        fetchRows<EntryRow>("money_ledger", "entry_date", range, "id"),
        fetchRows<CashRow>("cash_book", "entry_date", range, "source_id"),
      ]);
      return { sales, bills, entries, cash };
    },
  });

  const view = useMemo(() => {
    if (!data || !settings) return null;
    const codes = settings.accounting_codes ?? {};
    const registered = settings.vat_registered;
    const live = data.bills.filter((b) => b.status !== "void");
    const label = range.from
      ? `${range.from} to ${range.to ?? range.from}`
      : "All dates";
    const opts = {
      vatRegistered: registered,
      vatScheme: settings.vat_scheme,
      flatRatePercent: settings.flat_rate_percent,
    };
    const files: { name: string; csv: Csv }[] = [];
    if (software === "xero") {
      files.push({
        name: "Sales invoices and credit notes",
        csv: xeroSales(data.sales, codes),
      });
      files.push({
        name: "Bills and expenses",
        csv: xeroBills(live, codes, registered),
      });
    } else if (software === "quickbooks") {
      files.push({
        name: "Sales invoices and credit notes",
        csv: quickbooksSales(data.sales, codes),
      });
      files.push({
        name: "Bills and expenses",
        csv: quickbooksBills(live, codes, registered),
      });
    } else {
      files.push({
        name: "Sales and purchases",
        csv: sage50(data.sales, live, codes, registered),
      });
    }
    const workings = vatWorkings(
      data.sales,
      data.bills,
      opts,
      label,
      data.entries,
    );
    const bank = bankFile(software, data.cash, codes, scope);
    if (registered)
      files.push({ name: "VAT return workings", csv: workings.csv });
    return {
      label,
      files,
      bank,
      workings,
      checks: readiness(data.sales, data.bills, codes, {
        ...opts,
        businessName: settings.legal_name || settings.trading_name,
        vatNumber: settings.vat_number,
      }),
    };
  }, [data, settings, software, scope, range.from, range.to]);

  const download = (csv: Csv, label: string) =>
    downloadCsv(
      `${csv.filename}-${label.replaceAll(" ", "_")}.csv`,
      toCsv(csv.rows, csv.columns),
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 md:px-0">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <PackageCheck className="size-6 text-muted-foreground" /> Accountant's
        pack
      </h1>
      <p className="text-sm text-muted-foreground">
        Files for your accountant to import, and the VAT return worked out with
        every figure traced to its documents. Each line names the order it
        belongs to and carries the order's note. Nothing is filed with HMRC.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pack-period">Period</Label>
          <select
            id="pack-period"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pack-software">Accountant uses</Label>
          <select
            id="pack-software"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={software}
            onChange={(e) => setSoftware(e.target.value as Software)}
          >
            {SOFTWARE.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-3 md:col-span-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pack-from">From</Label>
              <Input
                id="pack-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pack-to">To</Label>
              <Input
                id="pack-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">Could not load the figures.</p>
      )}

      {view && data && (
        <>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">Before you send it</h2>
            {view.checks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing to fix. {data.sales.length} sales lines and{" "}
                {data.bills.length} bills in this period.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {view.checks.map((c) => (
                  <li key={c.text} className="flex gap-2">
                    <span
                      className={
                        c.level === "fix"
                          ? "shrink-0 rounded bg-destructive/10 px-1.5 text-xs font-medium text-destructive"
                          : "shrink-0 rounded bg-warning-soft px-1.5 text-xs font-medium text-warning"
                      }
                    >
                      {c.level === "fix" ? "Fix" : "Check"}
                    </span>
                    {c.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {settings?.vat_registered && (
            <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold">
                VAT return workings, {view.label}
              </h2>
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                {(
                  [
                    ["1", "VAT due on sales", view.workings.boxes.box1],
                    ["3", "Total VAT due", view.workings.boxes.box3],
                    [
                      "4",
                      "VAT reclaimed on purchases",
                      view.workings.boxes.box4,
                    ],
                    [
                      "5",
                      "Net VAT to pay or reclaim",
                      view.workings.boxes.box5,
                    ],
                    ["6", "Total sales before VAT", view.workings.boxes.box6],
                    [
                      "7",
                      "Total purchases before VAT",
                      view.workings.boxes.box7,
                    ],
                  ] as const
                ).map(([box, text, value]) => (
                  <div key={box} className="contents">
                    <dt className="text-muted-foreground">
                      Box {box}: {text}
                    </dt>
                    <dd className="text-right tabular-nums">
                      {formatPence(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {view.workings.notes.map((n) => (
                <p key={n} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">Files</h2>
            {view.files.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {f.name}
                  <span className="ml-2 text-muted-foreground">
                    {f.csv.rows.length} rows
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.csv.rows.length === 0}
                  onClick={() => download(f.csv, view.label)}
                >
                  Download
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Account codes come from Business and VAT. Tax names follow the
              usual UK setup for each product; if your accountant's differ, they
              can change them in the file before importing.
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold">
              Everything else: the money book
            </h2>
            <p className="text-sm text-muted-foreground">
              Wages, tax, owner drawings, sales taken outside invoices and every
              other entry, as bank-style lines your accountant's software
              imports, each with its note. The PDF is a readable report of the
              same period.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pack-scope">What to include</Label>
              <select
                id="pack-scope"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={scope}
                onChange={(e) => setScope(e.target.value as BankScope)}
              >
                <option value="entries">
                  Only money-book entries (the sales and bills files cover the
                  rest)
                </option>
                <option value="all">
                  Everything that moved, including customer payments and paid
                  bills
                </option>
              </select>
              {scope === "all" && (
                <p className="text-xs text-warning">
                  Do not import this together with the sales and bills files for
                  the same period. The same sale or bill would be counted twice.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                Bank-style file
                <span className="ml-2 text-muted-foreground">
                  {view.bank.rows.length} rows
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={view.bank.rows.length === 0}
                onClick={() => download(view.bank, view.label)}
              >
                Download
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                PDF report
                <span className="ml-2 text-muted-foreground">
                  {data.cash.length} lines
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={data.cash.length === 0}
                onClick={() =>
                  downloadCashBookPdf({
                    businessName:
                      settings?.trading_name || settings?.legal_name || "",
                    periodLabel: view.label,
                    rows: data.cash,
                    includesPrivate: !!isAdmin,
                  })
                }
              >
                Download
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
