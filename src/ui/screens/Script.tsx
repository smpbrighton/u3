import { useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { ChipTabsList, ChipTabsRoot, ChipTabsTrigger } from "../../../seed-design/ui/chip-tabs";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { TextField, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { RadioSelectBoxRoot, RadioSelectBoxItem } from "../../../seed-design/ui/select-box";
import { api, watchJob, type EngineJob } from "../api";
import type { CodexScript, FrameGroup, Project, SystemStatus } from "../types";
import type { MemeMeta } from "../../core/schema";
import { resolveScriptMemes } from "../../core/script-memes";
import { timelineFromScript, type SfxLibraryItem } from "../../core/timeline/from-script";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { inputDisplayName } from "../../core/input";
import { scriptGenerationView, type ScriptGenerationState } from "./script-workflow";

type SfxLibraryResponseItem = SfxLibraryItem & { ref: string; url: string };

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
  const [generation, setGeneration] = useState<ScriptGenerationState>({ phase: "idle", message: null, cancellable: false });
  const controllerRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
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
    const second = duration * (frameIndex + 0.5) / frameCount;
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
    setGeneration({ phase: "starting", message: "대본 작업을 준비하고 있어요.", cancellable: false });
    jobIdRef.current = null;
    setTranscriptWarning(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await api<EngineJob>("POST", `/api/projects/${props.project.id}/script/recommend`, {
        prompt: mode === "direct" ? prompt.trim() : "영상과 사진을 보고 장면별 대본을 추천해 주세요.",
      }, controller.signal);
      jobIdRef.current = response.id;
      setGeneration({ phase: "running", message: response.message ?? "Codex 실행 중", cancellable: response.cancellable });
      const done = await watchJob(response.id, next => {
        setJob(next);
        setGeneration({ phase: "running", message: next.message, cancellable: next.cancellable });
      }, controller.signal);
      if (done.status !== "done") throw new Error(done.error ?? done.message ?? "대본 생성을 마치지 못했어요.");
      const result = done.result as { script?: CodexScript; transcriptWarnings?: { inputId: string; warning: string }[] };
      if (!result.script) throw new Error("엔진이 대본을 반환하지 않았어요.");
      const warning = result.transcriptWarnings?.map(item => item.warning).join(" · ") ?? null;
      setTranscriptWarning(warning);
      const inputs = props.project.inputs.filter(input => input.id !== "placeholder");
      const rankedMemes = await Promise.all(result.script.scenes.map(async (scene) => {
        if (scene.reaction === null) return undefined;
        try {
          const ranked = await api<{ list: { meme: MemeMeta }[] }>("POST", `/api/projects/${props.project.id}/memes/rank`, {
            caption: scene.caption,
            reaction: scene.reaction,
            query: scene.caption,
          }, controller.signal);
          return ranked.list.map(item => item.meme);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          return null;
        }
      }));
      const resolvedMemes = resolveScriptMemes(result.script, rankedMemes);
      const script = resolvedMemes.script;
      const sfxItems = await api<SfxLibraryResponseItem[]>("GET", "/api/library/sfx", undefined, controller.signal).catch(() => []);
      const sfxLibrary: Record<string, SfxLibraryItem[]> = {};
      for (const item of sfxItems) (sfxLibrary[item.category] ??= []).push({ ...item, file: item.ref });
      const timeline = timelineFromScript(script, inputs, { projectId: props.project.id, memes: resolvedMemes.memes, alternateMemes: resolvedMemes.alternateMemes, sfxLibrary });
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, {
        ...props.project,
        inputs,
        timeline,
        savedAt: new Date().toISOString(),
      });
      props.onProject(saved);
      setGeneration({ phase: "idle", message: null, cancellable: false });
      const notices = [warning ? `받아 적기 안내: ${warning}` : null, resolvedMemes.missingCount ? `짤을 넣지 못한 장면 ${resolvedMemes.missingCount}개` : null].filter(Boolean);
      props.onSnackbar(notices.length ? `대본을 만들었어요. ${notices.join(" · ")}` : "대본을 만들었어요.");
      props.onStudio();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : String(error);
      setGeneration({ phase: "failed", message: null, cancellable: false, error: message });
      props.onSnackbar(message);
    } finally {
      controllerRef.current = null;
      jobIdRef.current = null;
      setBusy(false);
    }
  }

  async function cancel() {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      await api("DELETE", `/api/jobs/${jobId}`);
      controllerRef.current?.abort();
      setJob(current => current ? { ...current, status: "discarded", message: "취소했어요." } : current);
      setGeneration({ phase: "idle", message: null, cancellable: false });
      setBusy(false);
      props.onSnackbar("대본 만들기를 취소했어요.");
    } catch (error) {
      props.onSnackbar(error instanceof Error ? error.message : String(error));
    }
  }

  const codexMessage = props.status && !props.status.codex.installed
    ? "Codex CLI를 찾지 못해 대본을 만들 수 없어요."
    : props.status && !props.status.codex.loggedIn
      ? "Codex에 로그인되어 있지 않아 대본을 만들 수 없어요."
      : null;
  const workflowView = scriptGenerationView(generation);

  return (
    <section className="script-screen" aria-label="대본 방식 고르기">
      <header className="script-header">
        <ActionButton
          className="flow-back-button"
          variant="ghost"
          aria-label="미디어 넣기로 돌아가기"
          onClick={props.onBack}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} />
        </ActionButton>
        <strong>{props.project.name}</strong>
        <ChipTabsRoot className="steps" value="script" size="medium" variant="neutralSolid" aria-label="단계" onValueChange={value => {
          if (value === "media") props.onBack();
          if (value === "studio") props.onStudio();
        }}>
          <ChipTabsList>
            <ChipTabsTrigger value="media">1 미디어</ChipTabsTrigger>
            <ChipTabsTrigger value="script">2 대본</ChipTabsTrigger>
            <ChipTabsTrigger value="studio" disabled={!props.project.timeline.video.length}>3 스튜디오</ChipTabsTrigger>
          </ChipTabsList>
        </ChipTabsRoot>
      </header>
      <main className="script-main">
        {codexMessage ? (
          <div className="page-banner-wrap">
            <PageBanner tone="warning" variant="weak" description={codexMessage} />
          </div>
        ) : null}
        <RadioSelectBoxRoot aria-label="대본 방식" value={mode} onValueChange={value => setMode(value as "ai" | "direct")} columns={2}>
          <RadioSelectBoxItem value="ai" label="AI 추천" description="영상 프레임과 사진을 보고 AI가 씁니다" />
          <RadioSelectBoxItem value="direct" label="직접 쓰기" description="간략하게 쓰면 AI가 장면 대본으로 만듭니다" />
        </RadioSelectBoxRoot>
      {mode === "ai" ? (
        <section className="section-card" aria-labelledby="frame-title" style={{ marginTop: 20 }}>
          <div className="screen-header">
            <div>
              <h2 id="frame-title">AI가 볼 이미지</h2>
            </div>
            <span>{loadingFrames ? "불러오는 중" : `${totalFrames} / 40장`}</span>
          </div>
          {frames.length ? (
            <div className="frame-groups">
              {frames.map(group => {
                const input = inputs.find(item => item.id === group.inputId);
                const fileName = input ? inputDisplayName(input) : "파일";
                const inputNumber = inputs.findIndex(item => item.id === group.inputId) + 1;
                const label = input?.kind === "video"
                  ? `${inputNumber} · ${fileName} (영상 ${formatDuration(input.durationSec ?? 0)})`
                  : `${inputNumber} · ${fileName} (사진)`;
                return (
                  <div key={group.inputId}>
                    <h3 className="frame-group-label">{label}</h3>
                    <div className="frame-grid">
                      {group.frames.map((frame, frameIndex) => {
                        const timeLabel = frameLabel(group.inputId, frameIndex, group.frames.length);
                        return (
                          <div className="frame-card" key={frame.file}>
                            <img src={frame.url} alt={`${fileName} ${timeLabel}`} />
                            <span>{timeLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : loadingFrames ? (
            <div className="progress-row">
              <ProgressCircle size="24" tone="neutral" />
              이미지를 준비하고 있어요.
            </div>
          ) : <p>표시할 이미지가 없어요.</p>}
        </section>
      ) : (
        <section className="section-card" style={{ marginTop: 20 }}>
          <TextField label="간략한 대본" description="짧은 문장으로 내용을 적어 주세요.">
            <TextFieldTextarea style={{ minHeight: 220 }} placeholder="예: 비 오는 날 카페에 갔는데 자리가 없어서 30분 기다렸어요." value={prompt} onChange={event => setPrompt(event.currentTarget.value)} />
          </TextField>
        </section>
      )}
        {transcriptWarning ? (
          <div className="page-banner-wrap" role="status">
            <PageBanner tone="warning" variant="weak" description={`받아 적기를 건너뛰었어요: ${transcriptWarning}`} />
          </div>
        ) : null}
        {busy && workflowView.progress ? (
          <div className="progress-row" aria-live="polite">
            <ProgressCircle
              size="24"
              tone="brand"
              value={job?.progress === null || job?.progress === undefined ? undefined : job.progress * 100}
            />
            {workflowView.progress}
            {workflowView.showCancel ? (
              <ActionButton variant="neutralWeak" size="small" onClick={() => void cancel()}>
                취소
              </ActionButton>
            ) : null}
          </div>
        ) : null}
        {workflowView.error ? (
          <div className="page-banner-wrap" role="alert">
            <PageBanner tone="warning" variant="weak" description={workflowView.error} />
          </div>
        ) : null}
      </main>
      <footer className="script-footer">
        <ActionButton variant="brandSolid" disabled={!canGenerate || busy || (mode === "ai" && loadingFrames)} loading={busy} onClick={() => void generate()}>대본 만들기</ActionButton>
      </footer>
    </section>
  );
}
