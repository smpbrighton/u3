import type { ComponentProps, ReactNode } from "react";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";

export type PropertyRowProps = ComponentProps<"div"> & {
  label: string;
  htmlFor?: string;
  value?: ReactNode;
};

/** design-src/u3.css의 .prow(.nov), .lb, .v. */
export function PropertyRow({ label, htmlFor, value, children, className, ...props }: PropertyRowProps) {
  return (
    <div data-slot="property-row" className={cn(
      "grid h-8 min-w-0 items-center gap-x-2.5",
      value == null ? "grid-cols-[96px_minmax(0,1fr)]" : "grid-cols-[96px_minmax(0,1fr)_48px]",
      className,
    )} {...props}>
      {htmlFor
        ? <Label htmlFor={htmlFor} className="block truncate text-xs font-normal text-muted-foreground">{label}</Label>
        : <span className="truncate text-xs text-muted-foreground">{label}</span>}
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
      {value != null && <span className="text-right text-xs tabular-nums">{value}</span>}
    </div>
  );
}
