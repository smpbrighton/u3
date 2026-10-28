import * as React from "react"
import { cn } from "./utils"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-border p-0.5 transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[18px] data-[size=default]:w-[30px] data-[size=sm]:h-[18px] data-[size=sm]:w-[30px] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=unchecked]:bg-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full size-3 bg-muted-foreground ring-0 transition-transform data-[state=checked]:translate-x-3 data-[state=checked]:bg-background data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
