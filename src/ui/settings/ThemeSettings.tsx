import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon, ComputerIcon } from "@hugeicons/core-free-icons";
import { useTheme, setTheme } from "../theme-state";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { cn } from "../components/ui/utils";

const OPTIONS = [
  { value: "dark", label: "다크", icon: Moon02Icon },
  { value: "light", label: "라이트", icon: Sun03Icon },
  { value: "system", label: "시스템 설정 따르기", icon: ComputerIcon },
] as const;

export function ThemeSettings() {
  const theme = useTheme();
  return <section aria-labelledby="theme-title" className="flex flex-col gap-2">
    <h2 id="theme-title" className="text-[14px] font-bold">테마</h2>
    <RadioGroup aria-labelledby="theme-title" value={theme} onValueChange={value => {
      if (value === "dark" || value === "light" || value === "system") setTheme(value);
    }} className="grid grid-cols-3 gap-3">
      {OPTIONS.map(option => <label key={option.value} htmlFor={`theme-${option.value}`} className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-border p-2 focus-within:ring-2 focus-within:ring-ring",
        theme === option.value && "border-primary ring-1 ring-primary",
      )}>
        <RadioGroupItem id={`theme-${option.value}`} value={option.value} aria-label={option.label} className="sr-only" />
        <span aria-hidden="true" className="flex h-24 overflow-hidden rounded-md border border-border">
          {option.value === "system" ? <><span className="flex-1 bg-[#0e0e10]" /><span className="flex-1 bg-white" /></> : <>
            <span className={cn("w-[30%] border-r", option.value === "dark" ? "border-[#2a2a2e] bg-[#151517]" : "border-[#e4e4e7] bg-[#f7f7f8]")} />
            <span className={cn("flex flex-1 flex-col gap-1.5 p-3", option.value === "dark" ? "bg-[#0e0e10]" : "bg-white")}>
              <span className={cn("h-2 w-3/5 rounded-sm", option.value === "dark" ? "bg-[#3f3f46]" : "bg-[#d4d4d8]")} />
              <span className={cn("h-2 w-2/5 rounded-sm", option.value === "dark" ? "bg-[#ff8a3d]" : "bg-[#c2410c]")} />
            </span>
          </>}
        </span>
        <span className="flex items-center gap-2 px-1 pb-1 text-sm"><HugeiconsIcon icon={option.icon} aria-hidden="true" className="size-4 shrink-0" />{option.label}</span>
      </label>)}
    </RadioGroup>
  </section>;
}
