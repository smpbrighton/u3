import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { SegmentedControl, SegmentedControlItem } from "../../../seed-design/ui/segmented-control";
import { TextField, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { api, watchJob, type EngineJob } from "../api";
import type { CodexScript, FrameGroup, Project, SystemStatus } from "../types";
import { timelineFromScript } from "../../core/timeline/from-script";

export function Script(props: {
  project: Project;
  status: SystemStatus | null;
  onProject: (project: Project) => void;
  onStudio: () => void;
  onBack: () => void;
  onSnackbar: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"ai" | "direct">("ai");
  const [prompt, setPrompt] = useState("");
  const [frames, setFrames] = useState<FrameGroup[]>([]);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [transcriptWarning, setTranscriptWarning] = useState<string | null>(null);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [busy, setBusy] = useState(false);
  const canGenerate = Boolean(props.status?.codex.installed && props.status.codex.loggedIn);
  const totalFrames = useMemo(() => frames.reduce((total, group) => total + group.frames.length, 0), [frames]);
  const inputs = useMemo(() => props.project.inputs.filter(input => input.id !== "placeholder"), [props.project.inputs]);

  function formatDuration(seconds: number): string {
    const wholeSeconds = Math.floor(seconds);
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
  }

  function frameLabel(inputId: string, frameIndex: number, frameCount: number): string {
    const input = inputs.find(item => item.id === inputId);
    if (input?.kind === "photo") return "사진";
    const duration = input?.durationSec ?? 0;
    const second = frameCount > 1 ? duration * frameIndex / (frameCount - 1) : 0;
    return `${second.toFixed(1)}s`;
  }

  useEffect(() => {
    if (!props.project.inputs.some(input => input.id !== "placeholder")) return;
    setLoadingFrames(true);
    void api<FrameGroup[]>("POST", `/api/projects/${props.project.id}/frames`, {})
      .then(setFrames)
      .catch(error => props.onError(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoadingFrames(false));
  }, [props.project.id]);

  async function generate() {
    if (!canGenerate) {
      props.onSnackbar("Codex를 설치하고 로그인한 뒤 대본을 만들 수 있어요.");
      return;
    }
    if (mode === "direct" && !prompt.trim()) {
      props.onSnackbar("간략한 대본을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setJob(null);
    setTranscriptWarning(null);
    const controller = new AbortController();
    try {
      const response = await api<EngineJob>("POST", `/api/projects/${props.project.id}/script/recommend`, {
        prompt: mode === "direct" ? prompt.trim() : "영상과 사진을 보고 장면별 대본을 추천해 주세요.",
      });
      const done = await watchJob(response.id, setJob, controller.signal);
      if (done.status !== "done") throw new Error(done.error ?? done.message ?? "대본 생성을 마치지 못했어요.");
      const result = done.result as { script?: CodexScript; transcriptWarnings?: { inputId: string; warning: string }[] };
      if (!result.script) throw new Error("엔진이 대본을 반환하지 않았어요.");
      const warning = result.transcriptWarnings?.map(item => item.warning).join(" · ") ?? null;
      setTranscriptWarning(warning);
      const inputs = props.project.inputs.filter(input => input.id !== "placeholder");
      const timeline = timelineFromScript(result.script, inputs);
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, {
        ...props.project,
        inputs,
        timeline,
        savedAt: new Date().toISOString(),
      });
      props.onProject(saved);
      props.onSnackbar(warning ? `대본을 만들었어요. 받아 적기 안내: ${warning}` : "대본을 만들었어요.");
      props.onStudio();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      props.onSnackbar(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job?.id) return;
    try {
      await api("DELETE", `/api/jobs/${job.id}`);
      setJob(current => current ? { ...current, status: "discarded", message: "취소했어요." } : current);
      setBusy(false);
    } catch (error) {
      props.onSnackbar(error instanceof Error ? error.message : String(error));
    }
  }

  const codexMessage = props.status && !props.status.codex.installed
    ? "Codex CLI를 찾지 못해 대본을 만들 수 없어요."
    : props.status && !props.status.codex.loggedIn
      ? "Codex에 로그인되어 있지 않아 대본을 만들 수 없어요."
      : null;

  return (
    <section className="screen" aria-labelledby="script-title">
      <div className="flow-top">
        <ActionButton variant="ghost" onClick={props.onBack}>← 미디어 넣기</ActionButton>
        <strong>{props.project.name}</strong>
        <ol className="steps" aria-label="단계"><li className="step">1 미디어</li><li className="step" aria-current="step">2 대본</li><li className="step">3 스튜디오</li></ol>
      </div>
      <header className="screen-header"><div><h1 id="script-title" className="screen-title">대본 방식 고르기</h1></div></header>
      {codexMessage ? <div className="page-banner-wrap"><PageBanner tone="warning" variant="weak" description={codexMessage} /></div> : null}
      <SegmentedControl aria-label="대본 방식" value={mode} onValueChange={value => setMode(value as typeof mode)}>
        <SegmentedControlItem value="ai">AI 추천</SegmentedControlItem>
        <SegmentedControlItem value="direct">직접 쓰기</SegmentedControlItem>
      </SegmentedControl>
      {mode === "ai" ? (
        <section className="section-card" aria-labelledby="frame-title" style={{ marginTop: 20 }}>
          <div className="screen-header">
            <div><h2 id="frame-title">AI가 볼 이미지</h2><p className="screen-subtitle">입력별 프레임을 최대 40장까지 보여줘요.</p></div>
            <span>{loadingFrames ? "불러오는 중" : `${totalFrames} / 40장`}</span>
          </div>
          {frames.length ? <div className="frame-groups">{frames.map((group, index) => {
            const input = inputs.find(item => item.id === group.inputId);
            const fileName = input?.file.split("/").at(-1) ?? "파일";
            const label = input?.kind === "video"
              ? `${index + 1} · ${fileName} (영상 ${formatDuration(input.durationSec ?? 0)})`
              : `${index + 1} · ${fileName} (사진)`;
            return <div key={group.inputId}><h3 className="frame-group-label">{label}</h3><div className="frame-grid">{group.frames.map((frame, frameIndex) => <div className="frame-card" key={frame.file}><img src={frame.url} alt={`${fileName} ${frameLabel(group.inputId, frameIndex, group.frames.length)}`} /><span>{frameLabel(group.inputId, frameIndex, group.frames.length)}</span></div>)}</div></div>;
          })}</div> : loadingFrames ? <div className="progress-row"><ProgressCircle size="24" tone="neutral" /> 이미지를 준비하고 있어요.</div> : <p>표시할 이미지가 없어요.</p>}
        </section>
      ) : (
        <section className="section-card" style={{ marginTop: 20 }}>
          <TextField label="간략한 대본" description="짧은 문장으로 내용을 적어 주세요.">
            <TextFieldTextarea style={{ minHeight: 220 }} placeholder="예: 비 오는 날 카페에 갔는데 자리가 없어서 30분 기다렸어요." value={prompt} onChange={event => setPrompt(event.currentTarget.value)} />
          </TextField>
        </section>
      )}
      {transcriptWarning ? <p className="error-banner" role="status">받아 적기를 건너뛰었어요: {transcriptWarning}</p> : null}
      {job && busy ? <div className="progress-row" aria-live="polite"><ProgressCircle size="24" tone="brand" value={job.progress === null ? undefined : job.progress * 100} />{job.message ?? "대본을 만들고 있어요."}<ActionButton variant="neutralWeak" size="small" onClick={() => void cancel()}>취소</ActionButton></div> : null}
      {job?.status === "failed" ? <p className="error-banner" role="alert">{job.error ?? "대본을 만들지 못했어요."}</p> : null}
      <div className="action-row">
        <ActionButton variant="brandSolid" disabled={!canGenerate || busy || (mode === "ai" && loadingFrames)} loading={busy} onClick={() => void generate()}>대본 만들기</ActionButton>
      </div>
    </section>
  );
}
