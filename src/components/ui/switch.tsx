import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

// A switch in the style of the system one: a roomy track, and a thumb that stretches while it is
// pressed and then settles on a spring. The track colour eases rather than snapping.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent p-0.5 shadow-inner outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      style={{
        transition: "background-color 320ms ease, box-shadow 200ms ease",
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_2px_5px_oklch(0%_0_0/30%),0_0_0_0.5px_oklch(0%_0_0/10%)] ring-0",
          "translate-x-0 data-[state=checked]:translate-x-5",
          // Stretches toward the direction of travel while the finger is down.
          "group-active:w-[1.75rem] group-active:data-[state=checked]:translate-x-[1.0rem]"
        )}
        style={{
          transition:
            "transform 480ms var(--spring), width 220ms var(--ease-spring)",
        }}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
