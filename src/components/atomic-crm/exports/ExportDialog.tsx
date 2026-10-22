import { useState } from "react";
import { Download } from "lucide-react";
import { useNotify } from "ra-core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { downloadCsv, toCsv } from "./csv";
import { fetchAllRows } from "./exportPaging";
import { periodBounds, type PeriodPreset } from "./periods";

type Row = Record<string, unknown>;

export type ExportConfig = {
  // Base name of the file, e.g. "orders".
  filename: string;
  title: string;
  table: string;
  // PostgREST select, including embedded tables if the export needs their columns.
  select: string;
  // The column the period applies to. "date" columns compare by day, "timestamp" by moment.
  dateColumn: string;
  dateKind: "date" | "timestamp";
  filters: {
    label: string;
    column: string;
    options: { value: string; label: string }[];
  }[];
  columns: { key: string; label: string }[];
  toRow: (row: Record<string, unknown>) => Record<string, unknown>;
};

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "month", label: "A chosen month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last three months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All dates" },
];

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Start and end of a period, as the database compares them for this kind of column.
const bounds = (
  config: ExportConfig,
  range: { from: string | null; to: string | null },
) => {
  if (config.dateKind === "date")
    return { from: range.from, to: range.to, toExclusive: null };
  const next = (day: string) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  };
  return {
    from: range.from ? new Date(`${range.from}T00:00:00`).toISOString() : null,
    to: null,
    toExclusive: range.to ? next(range.to) : null,
  };
};

// A button that opens the export dialog for one list.
export const ExportDialogButton = ({ config }: { config: ExportConfig }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download /> Export
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="p-4 sm:max-w-md">
            <ExportForm config={config} onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

const ExportForm = ({
  config,
  onDone,
}: {
  config: ExportConfig;
  onDone: () => void;
}) => {
  const notify = useNotify();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [month, setMonth] = useState(thisMonth());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const range = periodBounds(preset, { month, from, to });
    if (preset === "custom" && (!from || !to)) {
      notify("Choose both a start and an end date.", { type: "error" });
      return;
    }
    if (preset === "custom" && to < from) {
      notify("The end date is before the start date.", { type: "error" });
      return;
    }
    if (preset === "month" && !range.from) {
      notify("Choose a month.", { type: "error" });
      return;
    }
    setBusy(true);
    try {
      const b = bounds(config, range);
      const rows = await fetchAllRows<Row>(async (start, end) => {
        const client = getSupabaseClient();
        let query = client.from(config.table).select(config.select);
        if (b.from) query = query.gte(config.dateColumn, b.from);
        if (b.to) query = query.lte(config.dateColumn, b.to);
        if (b.toExclusive) query = query.lt(config.dateColumn, b.toExclusive);
        for (const filter of config.filters) {
          const value = filterValues[filter.column];
          if (value) query = query.eq(filter.column, value);
        }
        const response = await query
          .order(config.dateColumn, { ascending: false })
          .range(start, end);
        // The select string is built at run time, so its row type is not known to the compiler.
        return {
          data: (response.data ?? null) as unknown as Row[] | null,
          error: response.error,
        };
      });

      if (rows.length === 0) {
        notify("No rows match these choices.", { type: "warning" });
        return;
      }
      const label = range.from
        ? `${range.from}_to_${range.to ?? range.from}`
        : "all-dates";
      const csv = toCsv(
        rows.map((row) => config.toRow(row)),
        config.columns,
      );
      downloadCsv(`${config.filename}-${label}.csv`, csv);
      notify(`${rows.length} ${rows.length === 1 ? "row" : "rows"} exported`);
      onDone();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "The export could not be made",
        {
          type: "error",
        },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        Export {config.title.toLowerCase()}
      </h2>

      <div className="flex flex-col gap-1">
        <Label htmlFor="export-period">Period</Label>
        <select
          id="export-period"
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

      {preset === "month" && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="export-month">Month</Label>
          <Input
            id="export-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      )}
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {config.filters.map((filter) => (
        <div key={filter.column} className="flex flex-col gap-1">
          <Label htmlFor={`export-${filter.column}`}>{filter.label}</Label>
          <select
            id={`export-${filter.column}`}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={filterValues[filter.column] ?? ""}
            onChange={(e) =>
              setFilterValues((current) => ({
                ...current,
                [filter.column]: e.target.value,
              }))
            }
          >
            <option value="">All</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        The file has every row that matches, not only the rows on screen. Money
        is in pounds.
      </p>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={download} disabled={busy}>
          <Download /> {busy ? "Preparing…" : "Download CSV"}
        </Button>
      </div>
    </div>
  );
};
