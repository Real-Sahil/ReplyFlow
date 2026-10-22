import { cn } from "@/lib/utils";

// How warm an open lead is. The band changes only past a margin, so it does not flicker
// when the score sits near a boundary (see next_lead_band in the database).
const BANDS = {
  frio: { label: "Cold", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  morno: {
    label: "Warm",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  quente: {
    label: "Hot",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
} as const;

export const LeadBandBadge = ({
  band,
  score,
}: {
  band: keyof typeof BANDS;
  score?: number;
}) => {
  const { label, tone } = BANDS[band];
  return (
    <span
      title={score != null ? `Lead score ${score} of 100` : undefined}
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}
    >
      {label}
    </span>
  );
};
