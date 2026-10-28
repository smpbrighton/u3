import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export type EmptyStateProps = Omit<ComponentProps<"div">, "children"> & {
  message: string;
  icon?: ReactNode;
  action: { label: string; onClick: () => void; disabled?: boolean };
};

/** design-src/u3.css의 .empty. 한 줄과 동작 하나만 받는다. */
export function EmptyState({ message, icon, action, className, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-1 flex-col items-center justify-center gap-3.5 text-muted-foreground", className)} {...props}>
      {icon && <span aria-hidden="true" className="[&_svg]:size-8">{icon}</span>}
      <p className="text-[14px] text-foreground">{message}</p>
      <Button onClick={action.onClick} disabled={action.disabled}>{action.label}</Button>
    </div>
  );
}
