import type { EngineJob } from "../api";
import { PropertyRow } from "../components/u3/PropertyRow";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";

export function ModelDownloadRow({ label, available, size, job, starting, disabled, onDownload, onCancel }: { label: string; available: boolean; size?: string; job?: EngineJob; starting?: boolean; disabled?: boolean; onDownload: () => void; onCancel: (jobId: string) => void }) {
  const downloading = Boolean(job || starting);
  return <PropertyRow density="setting" label={label} className="h-12" value={downloading
    ? <Button variant="outline" size="xs" disabled={!job} onClick={() => { if (job) onCancel(job.id); }}>취소</Button>
    : !available ? <Button variant="outline" size="sm" disabled={disabled} onClick={onDownload}>받기</Button> : undefined}>
    {downloading ? <div role="status" className="flex w-full min-w-0 items-center gap-2.5">
      <Progress aria-label={`${label} 다운로드`} value={job?.progress == null ? undefined : job.progress * 100} className="min-w-12 flex-1" />
      <span className="truncate text-xs text-muted-foreground tabular-nums">{job?.message ?? "받는 중"}{job?.progress == null ? "" : ` · ${Math.round(job.progress * 100)}%`}</span>
    </div> : <span role="status" className="inline-flex items-center gap-1.5 text-xs">
      {available && <><span aria-hidden="true" className="size-[7px] rounded-full bg-green-500" />준비됨</>}
      {size && <span className="text-muted-foreground">{available ? " · " : ""}{size}</span>}
    </span>}
  </PropertyRow>;
}
