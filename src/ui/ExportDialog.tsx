import { useEffect, useMemo, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ActionButton } from "../../seed-design/ui/action-button";
import { PageBanner } from "../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../seed-design/ui/progress-circle";
import { api, watchJob, type EngineJob } from "./api";
import { exportOverwriteWarning } from "./export-warning";
import { DialogRoot, DialogContent, DialogBody, DialogFooter } from "../../seed-design/ui/dialog";

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function ExportDialog(props: {
  projectId: string;
  projectName: string;
  timelineLength: number;
  onClose: () => void;
  onSnackbar: (message: string) => void;
}) {
  const defaultName = useMemo(() => `${props.projectName.replace(/[\\/:*?"<>|]/g, "-")}.mp4`, [props.projectName]);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [outputExists, setOutputExists] = useState<boolean | null>(null);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const manualOutputDirectory = (import.meta.env as ImportMetaEnv & { VITE_MANUAL_OUTPUT_DIR?: string }).VITE_MANUAL_OUTPUT_DIR;
    if (import.meta.env.DEV && manualOutputDirectory) {
      setOutputPath(`${manualOutputDirectory.replace(/\/$/, "")}/${defaultName}`);
      return () => { active = false; };
    }
    void homeDir().then(directory => {
      if (active) setOutputPath(`${directory.replace(/\/$/, "")}/Movies/U3/${defaultName}`);
    }).catch(() => {
      if (active) setOutputPath(`~/Movies/U3/${defaultName}`);
    });
    return () => { active = false; };
  }, [defaultName]);

  useEffect(() => {
    let active = true;
    setOutputExists(null);
    if (outputPath) {
      void api<{ exists: boolean }>("GET", `/api/output-exists?path=${encodeURIComponent(outputPath)}`)
        .then(result => { if (active) setOutputExists(result.exists); })
        .catch(() => { if (active) setOutputExists(null); });
    }
    return () => { active = false; };
  }, [outputPath]);

  async function chooseLocation() {
    try {
      const selected = await save({
        title: "내보내기 위치 선택",
        defaultPath: outputPath ?? defaultName,
        filters: [{ name: "MP4 동영상", extensions: ["mp4"] }],
      });
      if (selected) setOutputPath(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function startExport() {
    if (!outputPath) return;
    setError(null);
    try {
      const started = await api<EngineJob>("POST", `/api/projects/${encodeURIComponent(props.projectId)}/render`, { outputPath });
      setJob(started);
      const controller = new AbortController();
      const final = await watchJob(started.id, setJob, controller.signal);
      if (final.status === "done") {
        setComplete(true);
        props.onSnackbar("내보내기를 마쳤어요.");
      } else if (final.status === "failed") {
        setError(final.error ?? "내보내기를 마치지 못했어요.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      await api("DELETE", `/api/jobs/${job.id}`);
      setJob(current => current ? { ...current, status: "discarded", message: "취소했어요." } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function showInFinder() {
    if (!isTauri() || !outputPath) return;
    try {
      await revealItemInDir(outputPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const running = Boolean(job && ["queued", "running"].includes(job.status));
  const progress = job?.progress === null || job?.progress === undefined ? null : Math.round(job.progress * 100);
  const overwriteWarning = exportOverwriteWarning(outputPath, outputExists, complete);

  return (
    <DialogRoot open onOpenChange={open => { if (!open) props.onClose(); }}>
      <DialogContent className="export-dialog section-card" title="mp4 내보내기" showCloseButton={false}>
        <DialogBody>
        <div className="export-location">
          <span className="export-field-label">저장 위치</span>
          <div className="export-path-row"><span className="export-path" title={outputPath ?? undefined}>{outputPath ?? `~/Movies/U3/${defaultName}`}</span><ActionButton variant="neutralWeak" disabled={running} onClick={() => void chooseLocation()}>바꾸기</ActionButton></div>
          {overwriteWarning ? <div className="export-overwrite-warning" role="alert">{overwriteWarning}</div> : null}
          <span className="export-meta">1080×1920 · 30fps · {formatDuration(props.timelineLength)}</span>
        </div>
        {running ? <div className="export-progress" aria-live="polite"><div><span>{job?.message ?? "렌더 중"}</span><span>{progress === null ? "" : `${progress}%`}</span></div><ProgressCircle size="24" tone="brand" value={progress ?? undefined} /><ActionButton variant="neutralWeak" onClick={() => void cancel()}>취소</ActionButton></div> : null}
        {job?.status === "discarded" ? <p role="status">내보내기를 취소했어요.</p> : null}
        {error ? <div className="page-banner-wrap" role="alert"><PageBanner tone="warning" variant="weak" description={error} /></div> : null}
        {complete ? <div className="export-complete" role="status"><span>내보내기를 마쳤어요.</span>{isTauri() ? <ActionButton variant="neutralWeak" onClick={() => void showInFinder()}>Finder 에서 보기</ActionButton> : null}</div> : null}
        </DialogBody>
        <DialogFooter className="action-row export-actions">
          <ActionButton variant="ghost" onClick={props.onClose}>닫기</ActionButton>
          {!complete && !running ? <ActionButton variant="brandSolid" disabled={!outputPath} onClick={() => void startExport()}>내보내기</ActionButton> : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
