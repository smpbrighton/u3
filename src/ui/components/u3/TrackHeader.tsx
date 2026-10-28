import type { ComponentProps, ReactNode } from "react";
import { cn } from "../ui/utils";

export type TrackHeaderProps = Omit<ComponentProps<"div">, "title" | "onSelect"> & {
  title: string;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
};

/** design-src/u3.css의 .th, .n. 동작 영역은 이름 옆의 별도 칸이다. */
export function TrackHeader({ title, selected = false, onSelect, actions, className, ...props }: TrackHeaderProps) {
  return (
    <div data-slot="track-header" data-selected={selected} className={cn("flex h-7 min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-card pr-1.5 pl-2.5 text-xs text-muted-foreground data-[selected=true]:bg-primary/15 data-[selected=true]:font-bold data-[selected=true]:text-foreground", className)} {...props}>
      {onSelect
        ? <button type="button" onClick={onSelect} aria-pressed={selected} title={title} className="h-full min-w-0 flex-1 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</button>
        : <span title={title} className="min-w-0 flex-1 truncate">{title}</span>}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
