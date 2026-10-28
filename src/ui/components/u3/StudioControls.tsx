import type { ComponentProps } from "react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { PropertyRow } from "./PropertyRow";

export function StudioSlider(p: { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <Slider aria-label={p.label} min={p.min} max={p.max} step={p.step} value={[p.value]} disabled={p.disabled} onValueChange={([v]) => { if (v !== undefined) p.onChange(v); }} />;
}
export function StudioSwitch(p: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <Switch aria-label={p.label} checked={p.checked} onCheckedChange={p.onChange} disabled={p.disabled} />;
}
export function StudioTextInput(p: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & { label: string; value: string; onChange: (value: string) => void }) {
  const { label, onChange, ...rest } = p;
  return <Input aria-label={label} {...rest} onChange={e => onChange(e.target.value)} />;
}
export function StudioTextarea(p: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-xs text-muted-foreground">{p.label}<Textarea aria-label={p.label} rows={p.rows} value={p.value} onChange={e => p.onChange(e.target.value)} /></label>;
}
export function StudioSelect(p: { label: string; value: string; items: { value: string; label: string; disabled?: boolean }[]; onChange: (value: string) => void }) {
  return <Select value={p.value} onValueChange={p.onChange}><SelectTrigger aria-label={p.label} size="sm"><SelectValue /></SelectTrigger><SelectContent>{p.items.map(i => <SelectItem key={i.value} value={i.value} disabled={i.disabled}>{i.label}</SelectItem>)}</SelectContent></Select>;
}
export function RangeRow(p: ComponentProps<typeof StudioSlider> & { display: string }) {
  return <PropertyRow label={p.label} value={p.display}><StudioSlider {...p} /></PropertyRow>;
}
export function SwitchRow(p: ComponentProps<typeof StudioSwitch>) {
  return <PropertyRow label={p.label}><StudioSwitch {...p} /></PropertyRow>;
}
export function ColorRow(p: { label: string; value: string; onChange: (value: string) => void }) {
  return <PropertyRow label={p.label}><label className="flex h-7 items-center gap-2 rounded-md border border-input bg-background px-2 text-xs text-foreground"><input aria-label={p.label} type="color" className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" value={p.value} onChange={e => p.onChange(e.target.value)} /><span>{p.value.toUpperCase()}</span></label></PropertyRow>;
}
