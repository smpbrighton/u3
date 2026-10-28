import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { PropertyRow } from "./PropertyRow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function Choice(props: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <Select value={props.value} onValueChange={props.onChange} disabled={props.disabled}><SelectTrigger aria-label={props.label} size="sm"><SelectValue /></SelectTrigger><SelectContent>{props.options.map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select>;
}

export function RangeRow(props: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void; onCommit?: (value: number) => void }) {
  const value = Number(props.value.toFixed(2));
  return <PropertyRow label={props.label} value={`${value}${props.unit ?? "%"}`}><Slider aria-label={props.label} value={[value]} min={props.min ?? 0} max={props.max ?? 100} step={props.step ?? 1} disabled={props.disabled} onValueChange={values => props.onChange(values[0]!)} onValueCommit={values => props.onCommit?.(values[0]!)} /></PropertyRow>;
}

export function ColorRow(props: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; onCommit?: () => void }) {
  return <PropertyRow label={props.label}><div className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-1"><input className="h-5 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0" aria-label={props.label} type="color" disabled={props.disabled} value={props.value.startsWith("#") ? props.value : "#000000"} onChange={e => props.onChange(e.target.value)} onBlur={props.onCommit} /><Input className="h-6 border-0 px-0 text-xs" disabled={props.disabled} aria-label={`${props.label} 값`} value={props.value} onChange={e => props.onChange(e.target.value)} onBlur={props.onCommit} /></div></PropertyRow>;
}

export function TextBlock({ label, count = true, showLabel = true, ...props }: ComponentProps<typeof Textarea> & { label: string; count?: boolean; showLabel?: boolean }) {
  return <label className="my-1 flex min-w-0 flex-col gap-1.5">{showLabel && <Label asChild><span className="text-xs text-muted-foreground">{label}</span></Label>}<Textarea aria-label={label} {...props} />{count && props.maxLength && <span className="text-right text-[11px] text-muted-foreground tabular-nums">{String(props.value ?? props.defaultValue ?? "").length}/{props.maxLength}</span>}</label>;
}

export function IconButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string; children: ReactNode }) {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button variant="ghost" size="icon-sm" aria-label={label} {...props}>{children}</Button></span></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip></TooltipProvider>;
}

export function PlanningState() {
  return <div className="flex flex-1 flex-col gap-3" role="status"><span className="flex items-center gap-2 text-xs"><span className="size-4 animate-spin rounded-full border-2 border-accent border-t-foreground" />기획 중</span>{[1, 2, 3].map(n => <div key={n} className="h-30 max-w-190 animate-pulse rounded-lg bg-muted" />)}</div>;
}
