import { ResponsiveLine } from "@nivo/line";

import { formatPence } from "../quotes/quoteMath";
import type { Day } from "./forecast";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

// The expected bank balance, day by day. A line and a soft area, with a clear line at zero.
export const BalanceChart = ({ days }: { days: Day[] }) => {
  const lowest = Math.min(0, ...days.map((d) => d.balance));
  const highest = Math.max(0, ...days.map((d) => d.balance));
  const pad = Math.max((highest - lowest) * 0.1, 1000);
  const step = Math.max(1, Math.round(days.length / 6));
  return (
    <div
      role="img"
      aria-label={`Expected bank balance from ${shortDate(days[0].date)} to ${shortDate(days[days.length - 1].date)}`}
      className="h-64 w-full"
    >
      <ResponsiveLine
        data={[
          {
            id: "Balance",
            data: days.map((d) => ({ x: d.date, y: d.balance / 100 })),
          },
        ]}
        margin={{ top: 12, right: 16, bottom: 32, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{
          type: "linear",
          min: (lowest - pad) / 100,
          max: (highest + pad) / 100,
        }}
        curve="stepAfter"
        enableArea
        areaBaselineValue={0}
        areaOpacity={0.12}
        colors={["var(--primary)"]}
        lineWidth={2.5}
        enablePoints={false}
        enableGridX={false}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          format: (v) =>
            days.findIndex((d) => d.date === v) % step === 0
              ? shortDate(String(v))
              : "",
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          tickValues: 5,
          format: (v) => formatPence(Number(v) * 100).replace(".00", ""),
        }}
        markers={[
          {
            axis: "y",
            value: 0,
            lineStyle: {
              stroke: "var(--destructive)",
              strokeWidth: 1.5,
              strokeDasharray: "4 4",
            },
            legend: "",
            legendPosition: "left",
          },
        ]}
        useMesh
        tooltip={({ point }) => {
          const day = days.find((d) => d.date === point.data.x);
          return (
            <div className="rounded-lg bg-card px-3 py-2 text-sm shadow-[var(--shadow-lift)]">
              <div className="font-medium">
                {shortDate(String(point.data.x))}
              </div>
              <div className="tabular-nums">
                {formatPence(Math.round(Number(point.data.y) * 100))}
              </div>
              {day && (day.inPence > 0 || day.outPence > 0) ? (
                <div className="text-xs text-muted-foreground">
                  {day.inPence > 0 ? `In ${formatPence(day.inPence)} ` : ""}
                  {day.outPence > 0 ? `Out ${formatPence(day.outPence)}` : ""}
                </div>
              ) : null}
            </div>
          );
        }}
        theme={{
          text: { fill: "var(--muted-foreground)", fontSize: 12 },
          grid: { line: { stroke: "var(--border)", strokeWidth: 1 } },
          axis: { domain: { line: { stroke: "transparent" } } },
        }}
      />
    </div>
  );
};
