import { Fragment, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "../ui/utils";

export type StepNavItem = { id: string; label: string; disabled?: boolean };
export type StepNavProps = Omit<ComponentProps<"nav">, "children"> & {
  steps: readonly StepNavItem[];
  current: string;
  onStepChange?: (id: string) => void;
};

/** design-src/u3.css의 .steps. */
export function StepNav({ steps, current, onStepChange, className, ...props }: StepNavProps) {
  return (
    <nav aria-label="작업 단계" data-slot="step-nav" className={cn("flex items-center gap-1", className)} {...props}>
      {steps.map((step, index) => (
        <Fragment key={step.id}>
          {index > 0 && <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-3.5 shrink-0 text-placeholder" />}
          <button type="button" disabled={step.disabled} aria-current={step.id === current ? "step" : undefined} onClick={() => onStepChange?.(step.id)} className={cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40", step.id === current && "font-bold text-foreground")}>
            <span className={cn("flex size-5 items-center justify-center rounded-full border border-border text-2xs font-normal", step.id === current && "border-u3-solid bg-u3-solid text-u3-solid-foreground")}>{index + 1}</span>
            {step.label}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
