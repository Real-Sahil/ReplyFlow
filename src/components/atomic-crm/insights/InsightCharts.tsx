import { ResponsiveBar } from "@nivo/bar";
import { ResponsivePie } from "@nivo/pie";

import { formatPence } from "../quotes/quoteMath";
import type { Line } from "../finance/reports";
import type { MonthRow } from "./insights";

const theme = {
  text: { fill: "var(--muted-foreground)", fontSize: 12 },
  grid: { line: { stroke: "var(--border)", strokeWidth: 1 } },
  axis: { domain: { line: { stroke: "transparent" } } },
};

const shortMonth = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short" });
const longMonth = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
const compact = (pounds: number) =>
  Math.abs(pounds) >= 1000
    ? `£${Math.round(pounds / 100) / 10}k`
    : `£${Math.round(pounds)}`;

const Tip = ({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; pence: number }[];
}) => (
  <div className="rounded-lg bg-card px-3 py-2 text-sm shadow-[var(--shadow-lift)]">
    <div className="font-medium">{title}</div>
    {rows.map((r) => (
      <div key={r.label} className="flex justify-between gap-4 tabular-nums">
        <span className="text-muted-foreground">{r.label}</span>
        <span>{formatPence(r.pence)}</span>
      </div>
    ))}
  </div>
);

// Income and costs side by side for each month.
export const MonthlyBars = ({ months }: { months: MonthRow[] }) => (
  <div
    role="img"
    aria-label="Income and costs by month"
    className="h-64 w-full"
  >
    <ResponsiveBar
      data={months.map((m) => ({
        month: m.month,
        Income: m.income / 100,
        Costs: m.costs / 100,
      }))}
      keys={["Income", "Costs"]}
      indexBy="month"
      groupMode="grouped"
      margin={{ top: 12, right: 12, bottom: 32, left: 56 }}
      padding={0.25}
      innerPadding={2}
      colors={({ id }) =>
        id === "Income" ? "var(--primary)" : "var(--muted-foreground)"
      }
      borderRadius={3}
      enableLabel={false}
      enableGridX={false}
      axisBottom={{
        tickSize: 0,
        tickPadding: 8,
        format: (v) => shortMonth(String(v)),
      }}
      axisLeft={{
        tickSize: 0,
        tickPadding: 8,
        tickValues: 5,
        format: (v) => compact(Number(v)),
      }}
      theme={theme}
      tooltip={({ indexValue, data }) => (
        <Tip
          title={longMonth(String(indexValue))}
          rows={[
            { label: "Income", pence: Math.round(Number(data.Income) * 100) },
            { label: "Costs", pence: Math.round(Number(data.Costs) * 100) },
          ]}
        />
      )}
    />
  </div>
);

const PALETTE = [
  "oklch(0.58 0.17 28)",
  "oklch(0.72 0.12 70)",
  "oklch(0.62 0.09 200)",
  "oklch(0.6 0.12 285)",
  "oklch(0.74 0.09 140)",
  "oklch(0.52 0.05 30)",
  "oklch(0.7 0.02 60)",
];
const paletteFor = (i: number) => PALETTE[i % PALETTE.length];

// Where the costs go, as a ring with a plain list beside it (the list is the readable version).
export const CostDonut = ({ lines }: { lines: Line[] }) => {
  const total = lines.reduce((s, l) => s + l.pence, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div
        role="img"
        aria-label="Costs by category"
        className="h-52 w-52 shrink-0"
      >
        <ResponsivePie
          data={lines.map((l, i) => ({
            id: l.label,
            label: l.label,
            value: l.pence / 100,
            color: paletteFor(i),
          }))}
          colors={{ datum: "data.color" }}
          innerRadius={0.62}
          padAngle={1.5}
          cornerRadius={3}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          tooltip={({ datum }) => (
            <Tip
              title={String(datum.label)}
              rows={[
                {
                  label: `${Math.round((datum.value * 100 * 100) / Math.max(total, 1))}% of costs`,
                  pence: Math.round(datum.value * 100),
                },
              ]}
            />
          )}
        />
      </div>
      <ul className="w-full min-w-0 flex-1 text-sm">
        {lines.map((l, i) => (
          <li key={l.label} className="border-b py-1.5 last:border-b-0">
            <span className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 size-3 shrink-0 rounded-sm"
                style={{ background: paletteFor(i) }}
              />
              <span className="min-w-0 break-words">{l.label}</span>
            </span>
            <span className="block pl-5 text-xs tabular-nums text-muted-foreground">
              {formatPence(l.pence)} ·{" "}
              {Math.round((l.pence / Math.max(total, 1)) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// A horizontal bar per item, for customers and for how late money is.
export const HorizontalBars = ({
  rows,
  label,
  colors,
}: {
  rows: { name: string; pence: number }[];
  label: string;
  colors?: string[];
}) => (
  <div
    role="img"
    aria-label={label}
    style={{ height: Math.max(120, rows.length * 38 + 24) }}
    className="w-full"
  >
    <ResponsiveBar
      data={[...rows]
        .reverse()
        .map((r) => ({ name: r.name, value: r.pence / 100 }))}
      keys={["value"]}
      indexBy="name"
      layout="horizontal"
      margin={{ top: 4, right: 70, bottom: 8, left: 120 }}
      padding={0.3}
      colors={(bar) =>
        colors
          ? (colors[rows.length - 1 - Number(bar.index)] ?? "var(--primary)")
          : "var(--primary)"
      }
      borderRadius={3}
      enableGridY={false}
      enableGridX={false}
      axisBottom={null}
      axisLeft={{ tickSize: 0, tickPadding: 8 }}
      label={(d) => compact(Number(d.value))}
      labelSkipWidth={9999}
      theme={theme}
      layers={[
        "grid",
        "axes",
        "bars",
        "markers",
        "legends",
        "annotations",
        ({ bars }) => (
          <g>
            {bars.map((b) => (
              <text
                key={b.key}
                x={b.x + b.width + 8}
                y={b.y + b.height / 2}
                dominantBaseline="middle"
                fontSize={12}
                fill="var(--foreground)"
              >
                {compact(Number(b.data.value))}
              </text>
            ))}
          </g>
        ),
      ]}
      tooltip={({ indexValue, value }) => (
        <Tip
          title={String(indexValue)}
          rows={[{ label: "Total", pence: Math.round(Number(value) * 100) }]}
        />
      )}
    />
  </div>
);
