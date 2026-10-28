import { useId, useState, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { cn } from "../ui/utils";

export type PropertySectionProps = Omit<ComponentProps<"section">, "title"> & {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** design-src/u3.css의 .psec, .psec-h, .pstack. */
export function PropertySection({ title, defaultOpen = true, open, onOpenChange, children, className, ...props }: PropertySectionProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const expanded = open ?? localOpen;
  const id = useId();
  return (
    <section data-slot="property-section" className={cn("border-t border-border pt-3 pb-2", className)} {...props}>
      <h3>
        <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => {
          setLocalOpen(!expanded);
          onOpenChange?.(!expanded);
        }} className="mb-1 flex h-7 w-full items-center justify-between text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {title}
          <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" className={cn("size-4 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
        </button>
      </h3>
      <div id={id} hidden={!expanded} className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
