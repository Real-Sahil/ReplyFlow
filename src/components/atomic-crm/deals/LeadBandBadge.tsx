import { cn } from "@/lib/utils";

// How warm an open lead is. The band changes only past a margin, so it does not flicker
// when the score sits near a boundary (see next_lead_band in the database).
// A small tinted square with the score, and the word beside it: colour is never the only cue.
const BANDS = {
  frio: { label: "Cold", tone: "bg-cool text-foreground" },
  morno: { label: "Warm", tone: "bg-warning-soft text-warning" },
  quente: { label: "Hot", tone: "bg-accent text-accent-foreground" },
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
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
        tone,
      )}
    >
      {score != null ? (
        <span className="font-mono tabular-nums">{Math.round(score)}</span>
      ) : null}
      {label}
    </span>
  );
};
