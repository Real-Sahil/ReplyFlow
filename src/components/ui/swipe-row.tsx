import * as React from "react"

import { cn } from "@/lib/utils"

const COMMIT = 88
const MAX = 140

// A row you can swipe on a touch screen: right for one action, left for
// another. The action sits under the row and fills in as you drag; let go past
// the threshold and the row flies off and the action runs, otherwise it
// springs back. Vertical scrolling is left to the browser, and a mouse never
// triggers it.
export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Done",
  leftLabel = "Delete",
  className,
}: {
  children: React.ReactNode
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  rightLabel?: string
  leftLabel?: string
  className?: string
}) {
  const rowRef = React.useRef<HTMLDivElement>(null)
  const start = React.useRef<{ x: number; id: number } | null>(null)
  const [dx, setDx] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)

  const enabled = !!(onSwipeRight || onSwipeLeft)

  const settle = (to: number, after?: () => void) => {
    setDragging(false)
    setDx(to)
    if (after) window.setTimeout(after, 180)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || e.pointerType === "mouse") return
    start.current = { x: e.clientX, id: e.pointerId }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    let delta = e.clientX - s.x
    if (Math.abs(delta) < 6 && !dragging) return
    if (delta > 0 && !onSwipeRight) delta = 0
    if (delta < 0 && !onSwipeLeft) delta = 0
    // Past the limit the row resists, like stretching rubber.
    const over = Math.abs(delta) - MAX
    const eased = over > 0 ? MAX + over * 0.2 : Math.abs(delta)
    if (!dragging) {
      rowRef.current?.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    setDx(Math.sign(delta) * eased)
  }

  const onPointerUp = () => {
    if (!start.current) return
    start.current = null
    if (dx >= COMMIT && onSwipeRight) {
      settle(window.innerWidth, () => {
        onSwipeRight()
        setDx(0)
      })
    } else if (dx <= -COMMIT && onSwipeLeft) {
      settle(-window.innerWidth, () => {
        onSwipeLeft()
        setDx(0)
      })
    } else {
      settle(0)
    }
  }

  const progress = Math.min(1, Math.abs(dx) / COMMIT)

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {dx !== 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center px-4 text-sm font-semibold",
            dx > 0
              ? "justify-start bg-success text-primary-foreground"
              : "justify-end bg-destructive text-primary-foreground"
          )}
          style={{ opacity: 0.35 + progress * 0.65 }}
        >
          {dx > 0 ? rightLabel : leftLabel}
        </div>
      )}
      <div
        ref={rowRef}
        className="relative bg-background"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging
            ? "none"
            : "transform 450ms var(--spring, cubic-bezier(0.2, 0.8, 0.2, 1))",
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  )
}
