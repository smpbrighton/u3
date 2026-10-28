import type { ComponentProps, ReactNode } from "react";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";

export type PropertyRowProps = ComponentProps<"div"> & {
  label: string;
  htmlFor?: string;
  value?: ReactNode;
  density?: "default" | "setting";
};

/** design-src/u3.css의 .prow(.nov), .lb, .v. */
export function PropertyRow({ label, htmlFor, value, density = "default", children, className, ...props }: PropertyRowProps) {
  const setting = density === "setting";
  return (
    <div data-slot="property-row" className={cn(
      "grid min-w-0 items-center",
      setting ? "h-10 gap-x-4 border-b border-border" : "h-8 gap-x-2.5",
      setting
        ? value == null ? "grid-cols-[160px_minmax(0,1fr)]" : "grid-cols-[160px_minmax(0,1fr)_auto]"
        : value == null ? "grid-cols-[96px_minmax(0,1fr)]" : "grid-cols-[96px_minmax(0,1fr)_48px]",
      className,
    )} {...props}>
      {htmlFor
        ? <Label htmlFor={htmlFor} className={cn("block truncate font-normal text-muted-foreground", setting ? "text-sm" : "text-xs")}>{label}</Label>
        : <span className={cn("truncate text-muted-foreground", setting ? "text-sm" : "text-xs")}>{label}</span>}
      <div className={cn("flex min-w-0 items-center gap-2", setting ? "justify-start" : "justify-end")}>{children}</div>
      {value != null && <span className={cn("text-right text-xs tabular-nums", setting && "min-w-11")}>{value}</span>}
    </div>
  );
}
