import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { cn } from "./components/ui/utils";
import { SettingRow, SettingsGroup } from "./settings/SettingsControls";
import { updateLine, type UpdateSnapshot } from "./updater";

export function UpdateSidebar(props: { status: UpdateSnapshot | null; collapsed?: boolean; disabled: boolean; onRestart: () => void }) {
  const line = updateLine(props.status);
  if (!line) return null;
  const restartButton = <Button variant="secondary" size={props.collapsed ? "icon-sm" : "sm"} aria-label="다시 시작" disabled={props.disabled} onClick={props.onRestart} className={props.collapsed ? undefined : "w-full"}>
    <HugeiconsIcon icon={RefreshIcon} aria-hidden="true" className="size-4" />
    {!props.collapsed && "다시 시작"}
  </Button>;
  return (
    <div data-slot="update-sidebar" role="status" aria-label={line} className={cn("mt-auto flex w-full flex-col gap-2 border-t border-border pt-3 text-xs", props.collapsed ? "items-center" : "px-2.5")}>
      {props.status?.status === "downloading" ? <>
        <span className={cn("w-full whitespace-nowrap tabular-nums", props.collapsed ? "text-center" : "flex justify-between")}>
          {!props.collapsed && <span className="text-muted-foreground">업데이트 받는 중 </span>}
          <span>{props.status.percent}%</span>
        </span>
        <Progress value={props.status.percent} aria-label="업데이트 다운로드" />
      </> : <>
        <span className={props.collapsed ? "sr-only" : undefined}>{line}</span>
        {props.collapsed ? <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{restartButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>다시 시작</TooltipContent>
          </Tooltip>
        </TooltipProvider> : restartButton}
      </>}
    </div>
  );
}

export function AppInfo(props: { status: UpdateSnapshot | null; onCheck: () => void }) {
  return <SettingsGroup title="앱 정보">
    <SettingRow label="현재 버전"><span className="text-sm tabular-nums">{props.status?.currentVersion ?? "—"}</span></SettingRow>
    <SettingRow label="마지막 확인" value={<Button variant="outline" size="sm" disabled={!props.status || props.status.checking} onClick={props.onCheck}><HugeiconsIcon icon={RefreshIcon} aria-hidden="true" className="size-4" />지금 확인</Button>}>
      <span className="text-xs text-muted-foreground">{props.status?.lastCheckedAt ? <time dateTime={new Date(props.status.lastCheckedAt).toISOString()}>{new Date(props.status.lastCheckedAt).toLocaleString("ko-KR")}</time> : "아직 확인하지 않았어요"}</span>
    </SettingRow>
  </SettingsGroup>;
}
