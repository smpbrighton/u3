import { useState, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelLeftIcon } from "@hugeicons/core-free-icons";
import logo from "../../assets/logo-u3-mark.png";
import { readSidebarCollapsed, saveSidebarCollapsed } from "../../sidebar-state";
import type { UpdateSnapshot } from "../../updater";
import { UpdateSidebar } from "../../UpdateControls";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";

export type SidebarItem<T extends string> = {
  screen: T;
  label: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
};

export type SidebarProps<T extends string> = {
  items: readonly SidebarItem<T>[];
  current: T;
  onNavigate: (screen: T) => void;
  update: UpdateSnapshot | null;
  restarting: boolean;
  onRestart: () => void;
};

export function Sidebar<T extends string>({ items, current, onNavigate, update, restarting, onRestart }: SidebarProps<T>) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";

  function toggle() {
    const next = !collapsed;
    saveSidebarCollapsed(next);
    setCollapsed(next);
  }

  return (
    <aside aria-label="사이드바" data-slot="sidebar" data-collapsed={collapsed} className={cn(
      "flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 pt-5 pb-4 text-sidebar-foreground",
      collapsed ? "w-16 items-center" : "w-[220px]",
    )}>
      <div className={cn("mb-5 flex w-full items-center justify-between", collapsed ? "flex-col gap-3.5" : "h-8 pl-2")}>
        <img src={logo} alt="U3" className={cn("w-auto shrink-0", collapsed ? "h-5" : "h-6")} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls="u3-navigation" onClick={toggle} className="text-muted-foreground">
              <HugeiconsIcon icon={PanelLeftIcon} aria-hidden="true" className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
      <nav id="u3-navigation" aria-label="주 메뉴" className="flex w-full flex-col gap-0.5">
        {items.map(item => (
          <Tooltip key={item.screen}>
            <TooltipTrigger asChild>
              <Button variant="ghost" aria-label={item.label} aria-current={item.screen === current ? "page" : undefined} onClick={() => onNavigate(item.screen)} className={cn(
                "h-[34px] min-w-0 justify-start gap-2.5 px-2.5 text-muted-foreground aria-[current=page]:bg-secondary aria-[current=page]:font-bold aria-[current=page]:text-foreground",
                collapsed && "w-10 justify-center p-0",
              )}>
                <HugeiconsIcon icon={item.icon} aria-hidden="true" className="size-4" />
                {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>}
          </Tooltip>
        ))}
      </nav>
      <UpdateSidebar status={update} collapsed={collapsed} disabled={restarting} onRestart={onRestart} />
    </aside>
  );
}
