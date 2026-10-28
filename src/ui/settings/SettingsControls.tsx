import { useId, type ComponentProps, type ReactNode } from "react";
import { PropertyRow } from "../components/u3/PropertyRow";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";

export const SettingRow = (props: Omit<ComponentProps<typeof PropertyRow>, "density">) => <PropertyRow density="setting" {...props} />;

export function SettingsGroup({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="flex min-w-0 flex-col gap-0.5">
    <div className="mb-2 flex min-h-6 items-center justify-between gap-2"><h2 id={id} className="text-[14px] font-bold">{title}</h2>{action}</div>
    {children}
  </section>;
}

export function SettingsSelect({ label, value, items, onChange, disabled }: { label: string; value: string; items: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <Select value={value || undefined} onValueChange={onChange} disabled={disabled || !items.length}>
    <SelectTrigger id={id} aria-label={label} size="sm" className="max-w-[240px]"><SelectValue>{items.find(item => item.value === value)?.label ?? value}</SelectValue></SelectTrigger>
    <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function SettingsChoice({ label, value, items, onChange, disabled }: { label: string; value: string; items: readonly { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <ToggleGroup type="single" aria-label={label} value={value} disabled={disabled} onValueChange={next => { if (next) onChange(next); }} size="sm" spacing={0.5} className="h-7 w-[300px] max-w-full">
    {items.map(item => <ToggleGroupItem key={item.value} value={item.value} className="text-xs">{item.label}</ToggleGroupItem>)}
  </ToggleGroup>;
}

export function SettingsSlider({ label, value, min, max, step = 1, suffix = "", disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <SettingRow label={label} value={`${step < 1 ? value.toFixed(1) : Math.round(value)}${suffix}`}>
    <Slider aria-label={label} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={values => { if (values[0] !== undefined) onChange(values[0]); }} />
  </SettingRow>;
}

export function SettingsColor({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <SettingRow label={label}><label className="inline-flex h-7 items-center gap-2 rounded-md border border-input bg-background pr-2 pl-1 text-xs tabular-nums">
    <input type="color" aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="size-5 cursor-pointer overflow-hidden rounded-sm border border-border p-0" />
    <span>{value.toUpperCase()}</span>
  </label></SettingRow>;
}

export function SettingsIconButton({ label, children, ...props }: Omit<ComponentProps<typeof Button>, "aria-label"> & { label: string }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={label} {...props}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
