import type { ComponentProps } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function FlowIconButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <TooltipProvider><Tooltip>
    <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={label} {...props} /></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip></TooltipProvider>;
}
