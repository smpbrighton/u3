import type { ComponentProps } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** 비활성 버튼의 바깥 칸이 작업 막힘 이유를 표시한다. */
export function BusyButton(props: ComponentProps<typeof Button>) {
  if (!props.disabled || !props.title) return <Button {...props} />;
  return <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={props.title} className="inline-flex"><Button {...props} /></span></TooltipTrigger><TooltipContent>{props.title}</TooltipContent></Tooltip>;
}
