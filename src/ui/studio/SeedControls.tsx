import type React from "react";
import { Slider } from "../../../seed-design/ui/slider";
import { Switch } from "../../../seed-design/ui/switch";
import { TextField, TextFieldInput, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { SelectRoot, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "../../../seed-design/ui/select";

export function StudioSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return <Slider getAriaLabel={() => props.label} min={props.min} max={props.max} step={props.step} values={[props.value]} onValuesChange={values => { if (values[0] !== undefined) props.onChange(values[0]); }} disabled={props.disabled} />;
}

export function StudioSwitch(props: { label: string; checked: boolean; onChange: (checked: boolean) => void; size?: "16" | "24" | "32" }) {
  return <Switch label={props.label} checked={props.checked} onCheckedChange={props.onChange} size={props.size} />;
}

export function StudioTextInput(props: {
  label: string;
  value: string;
  inputMode?: "decimal" | "numeric";
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return <TextField aria-label={props.label} value={props.value} onValueChange={values => props.onChange(values.value)}><TextFieldInput aria-label={props.label} placeholder={props.placeholder} inputMode={props.inputMode} maxLength={props.maxLength} onBlur={props.onBlur} onKeyDown={props.onKeyDown} disabled={props.disabled} /></TextField>;
}

export function StudioTextarea(props: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return <TextField aria-label={props.label} value={props.value} onValueChange={values => props.onChange(values.value)}><TextFieldTextarea /></TextField>;
}

export function StudioSelect(props: { label: string; value: string; items: Array<{ value: string; label: string; disabled?: boolean }>; onChange: (value: string) => void }) {
  return <SelectRoot label={props.label} aria-label={props.label} value={[props.value]} onValueChange={values => { if (values[0]) props.onChange(values[0]); }} size="medium">
    <SelectTrigger aria-label={props.label} />
    <SelectContent><SelectGroup>{props.items.map(item => <SelectItem key={item.value} value={item.value} label={item.label} disabled={item.disabled} />)}</SelectGroup></SelectContent>
  </SelectRoot>;
}
