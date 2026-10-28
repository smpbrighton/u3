import type { ComponentProps } from "react";
import { cn } from "../ui/utils";

export type ToolbarProps = ComponentProps<"div"> & { "aria-label": string };

/** design-src/u3.css의 .toolbar. */
export function Toolbar({ className, ...props }: ToolbarProps) {
  return <div role="toolbar" data-slot="toolbar" className={cn("flex h-10 shrink-0 items-center gap-1 border-y border-border bg-card px-3", className)} {...props} />;
}
