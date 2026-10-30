import { cn } from "@/lib/utils"

// A row of equal choices with one thumb that glides to the picked one. The
// thumb moves with transform only, so it stays smooth.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<readonly [T, React.ReactNode]>
  label: string
  className?: string
}) {
  const index = Math.max(
    0,
    options.findIndex(([key]) => key === value)
  )
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "relative grid rounded-lg bg-muted p-0.5 text-sm",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-card shadow-[var(--shadow-card)] transition-transform duration-300 ease-[var(--spring)]"
        style={{
          width: `calc((100% - 0.25rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === value}
          onClick={() => onChange(key)}
          className={cn(
            "relative z-10 min-h-8 rounded-md px-3 font-medium",
            key === value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
