import { useEffect, useMemo, useRef, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "./components/ui/button";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Progress } from "./components/ui/progress";
import { api, watchJob, type EngineJob } from "./api";
import { exportOverwriteWarning } from "./export-warning";
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./components/ui/dialog";

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
  const watchController = useRef<AbortController | null>(null);
  useEffect(() => () => watchController.current?.abort(), []);
  const [starting, setStarting] = useState(false);
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
    setStarting(true);
    try {
      const started = await api<EngineJob>("POST", `/api/projects/${encodeURIComponent(props.projectId)}/render`, { outputPath });
      setJob(started);
      const controller = new AbortController();
      watchController.current = controller;
      const final = await watchJob(started.id, setJob, controller.signal);
      if (final.status === "done") {
        setComplete(true);
        props.onSnackbar("내보내기를 마쳤어요.");
      } else if (final.status === "failed") {
        setError(final.error ?? "내보내기를 마치지 못했어요.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setStarting(false); }
  }

  async function cancel() {
    if (!job) return;
    try {
      await api("DELETE", `/api/jobs/${job.id}`);
      props.onSnackbar("내보내기를 취소했어요");
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

  const running = starting || Boolean(job && ["queued", "running"].includes(job.status));
  const progress = job?.progress === null || job?.progress === undefined ? null : Math.round(job.progress * 100);
  const overwriteWarning = exportOverwriteWarning(outputPath, outputExists, complete);

  return (
    <DialogRoot open onOpenChange={open => { if (!open && !running) props.onClose(); }}>
      <DialogContent className="sm:max-w-[460px]" aria-describedby={undefined} showCloseButton={false}>
        <DialogHeader><DialogTitle>mp4 내보내기</DialogTitle></DialogHeader>
        <div className="grid gap-3">
        <div className="export-location">
          <span className="export-field-label">저장 위치</span>
          <div className="export-path-row"><span className="export-path" title={outputPath ?? undefined}>{outputPath ?? `~/Movies/U3/${defaultName}`}</span><Button variant="secondary" disabled={running} onClick={() => void chooseLocation()}>바꾸기</Button></div>
          {overwriteWarning ? <div className="export-overwrite-warning" role="alert">덮어써요</div> : null}
          <span className="export-meta">1080×1920 · 30fps · {formatDuration(props.timelineLength)}</span>
        </div>
        {running ? <div className="export-progress" aria-live="polite"><div><span>{job?.message ?? "렌더 중"}</span><span>{progress === null ? "" : `${progress}%`}</span></div><Progress value={progress ?? 0} /><Button variant="outline" disabled={!job} onClick={() => void cancel()}>취소</Button></div> : null}
        {job?.status === "discarded" ? <p role="status">내보내기를 취소했어요.</p> : null}
        {error ? <div role="alert"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div> : null}
        {complete ? <div className="export-complete" role="status"><span>내보내기를 마쳤어요.</span>{isTauri() ? <Button variant="secondary" onClick={() => void showInFinder()}>Finder 에서 보기</Button> : null}</div> : null}
        </div>
        <DialogFooter className="export-actions">
          {!running && <Button variant="outline" onClick={props.onClose}>닫기</Button>}
          {!complete && !running ? <Button variant="default" disabled={!outputPath || starting} onClick={() => void startExport()}>내보내기</Button> : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
