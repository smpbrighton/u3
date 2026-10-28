import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Alert } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { StepNav } from "../components/u3/StepNav";
import { CodexWarning } from "../components/u3/CodexWarning";
import { FlowIconButton } from "../components/u3/FlowIconButton";
import { api, watchJob, type EngineJob } from "../api";
import type { CodexScript, FrameGroup, Input, Project, SystemStatus } from "../types";
import type { MemeMeta } from "../../core/schema";
import { chooseMissingInputMemes, combineMissingMemeCounts, resolveScriptMemes, type AutomaticMemeRank } from "../../core/script-memes";
import { timelineFromScript, type SfxLibraryItem } from "../../core/timeline/from-script";
import { AlertCircleIcon, ArrowLeft01Icon, Image01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { inputDisplayName } from "../../core/input";
import { scriptGenerationView, type ScriptGenerationState } from "./script-workflow";

type SfxLibraryResponseItem = SfxLibraryItem & { ref: string; url: string };

export function ScriptFrames({ loading, groups, inputs }: { loading: boolean; groups: FrameGroup[]; inputs: Input[] }) {
  if (loading) return <div className="flex flex-col gap-5" role="status" aria-label="이미지 준비 중" aria-busy="true">
    {[0, 1, 2].map(index => <div key={index} className="flex flex-col gap-2" aria-hidden="true">
      <div className="h-3 w-[180px] animate-pulse rounded bg-muted" />
      <div className="flex gap-2">{[0, 1, 2, 3].map(frame => <div className="h-32 w-[72px] animate-pulse rounded-md bg-muted" key={frame} />)}</div>
    </div>)}
  </div>;
  if (!groups.some(group => group.frames.length)) return <div className="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3.5 text-muted-foreground">
    <HugeiconsIcon icon={Image01Icon} aria-hidden="true" className="size-8" /><p className="text-[14px] text-foreground">이미지가 없어요</p>
  </div>;
  return <div className="flex flex-col gap-5" aria-label="AI가 볼 이미지">
    {groups.filter(group => group.frames.length).map(group => {
      const inputIndex = inputs.findIndex(input => input.id === group.inputId);
      const input = inputs[inputIndex];
      const fileName = input ? inputDisplayName(input) : "파일";
      const duration = input?.durationSec ?? 0;
      return <section key={group.inputId} className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xs"><b className="tabular-nums">{inputIndex + 1}</b><span className="truncate">{fileName}</span><span className="shrink-0 text-muted-foreground">{input?.kind === "video" ? `${duration.toFixed(1)}초 · ${group.frames.length}장` : `사진 · ${group.frames.length}장`}</span></h2>
        <div className="flex flex-wrap gap-2">
          {group.frames.map((frame, index) => {
            const time = input?.kind === "photo" ? "사진" : `${(duration * (index + 0.5) / group.frames.length).toFixed(1)}초`;
            return <figure key={frame.file} className="flex w-16 flex-col items-center gap-1">
              <img src={frame.url} alt={`${fileName} ${time}`} className="h-[114px] w-16 rounded-md bg-muted object-cover" />
              <figcaption className="text-2xs text-muted-foreground tabular-nums">{time}</figcaption>
            </figure>;
          })}
        </div>
      </section>;
    })}
  </div>;
}

export function ScriptProgress({ state, progress, onCancel }: { state: ScriptGenerationState; progress: number | null; onCancel: () => void }) {
  const view = scriptGenerationView(state);
  if (!view.progress) return null;
  const percent = progress === null ? undefined : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return <div className="flex min-w-0 flex-1 items-center gap-3" aria-live="polite">
    <HugeiconsIcon icon={Loading03Icon} aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground" />
    <span className="text-sm">{view.progress}</span>
    <Progress className="min-w-12 flex-1" value={percent} aria-label="대본 생성 진행" />
    {percent !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>}
    {view.showCancel && <Button variant="outline" onClick={onCancel}>취소</Button>}
  </div>;
}

export function Script(props: {
  project: Project;
  status: SystemStatus | null;
  onProject: (project: Project) => void;
  onStudio: () => void;
  onBack: () => void;
  onSnackbar: (message: string) => void;
  onError: (message: string) => void;
  onSettings?: () => void;
  onNotices?: (notices: string[]) => void;
}) {
  const [mode, setMode] = useState<"ai" | "direct">("ai");
  const [prompt, setPrompt] = useState("");
  const [frames, setFrames] = useState<FrameGroup[]>([]);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [transcriptWarning, setTranscriptWarning] = useState<string | null>(null);
  const [loadingFrames, setLoadingFrames] = useState(() => props.project.inputs.some(input => input.id !== "placeholder"));
  const [frameError, setFrameError] = useState<string | null>(null);
  const [frameAttempt, setFrameAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState<ScriptGenerationState>({ phase: "idle", message: null, cancellable: false });
  const controllerRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const canGenerate = Boolean(props.status?.codex.installed && props.status.codex.loggedIn);
  const totalFrames = useMemo(() => frames.reduce((total, group) => total + group.frames.length, 0), [frames]);
  const inputs = useMemo(() => props.project.inputs.filter(input => input.id !== "placeholder"), [props.project.inputs]);

  useEffect(() => {
    if (!props.project.inputs.some(input => input.id !== "placeholder")) { setLoadingFrames(false); setFrames([]); return; }
    const controller = new AbortController();
    setFrames([]);
    setFrameError(null);
    setLoadingFrames(true);
    void api<FrameGroup[]>("POST", `/api/projects/${props.project.id}/frames`, {}, controller.signal)
      .then(groups => { if (!controller.signal.aborted) setFrames(groups); })
      .catch(error => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setFrameError(message);
        props.onError(message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingFrames(false); });
    return () => controller.abort();
  }, [props.project.id, frameAttempt]);

  async function generate() {
    if (busy || (mode === "ai" && loadingFrames)) return;
    if (!canGenerate) {
      props.onSnackbar("Codex를 설치하고 로그인한 뒤 대본을 만들 수 있어요.");
      return;
    }
    if (mode === "direct" && !prompt.trim()) {
      setGeneration({ phase: "failed", message: null, cancellable: false, error: "간략한 대본을 입력해 주세요" });
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
        mode,
        ...(mode === "direct" ? { prompt: prompt.trim() } : {}),
      }, controller.signal);
      jobIdRef.current = response.id;
      setGeneration({ phase: "running", message: response.message ?? "Codex 실행 중", cancellable: response.cancellable });
      const done = await watchJob(response.id, next => {
        setJob(next);
        setGeneration({ phase: "running", message: next.message, cancellable: next.cancellable });
      }, controller.signal);
      if (done.status !== "done") throw new Error(done.error ?? done.message ?? "대본 생성을 마치지 못했어요.");
      const result = done.result as { script?: CodexScript; transcriptWarnings?: { inputId: string; warning: string }[]; styleWarnings?: string[] };
      if (!result.script) throw new Error("엔진이 대본을 반환하지 않았어요.");
      const warning = [
        ...(result.transcriptWarnings ?? []).map(item => `받아 적기 안내: ${item.warning}`),
        ...(result.styleWarnings ?? []).map(item => `대본 말투 안내: ${item}`),
      ].join(" · ") || null;
      setTranscriptWarning(warning);
      const inputs = props.project.inputs.filter(input => input.id !== "placeholder");
      const rankedResults = await Promise.all(result.script.scenes.map(async (scene) => {
        if (scene.reaction === null) return null;
        try {
          return await api<{ by: "jev" | "rule"; list: { meme: MemeMeta; fit?: number }[] }>("POST", `/api/projects/${props.project.id}/memes/rank`, {
            caption: scene.caption,
            reaction: scene.reaction,
            query: scene.caption,
          }, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          return null;
        }
      }));
      const resolvedMemes = resolveScriptMemes(result.script, rankedResults.map(result => result?.list.map(item => item.meme)));
      const assignedInputIndexes = new Set(resolvedMemes.script.scenes.flatMap((scene, index) =>
        scene.memeBefore || scene.memeAfter || resolvedMemes.memes[index] ? [scene.inputIndex] : [],
      ));
      const missingInputIndexes = new Set(resolvedMemes.script.scenes.flatMap(scene =>
        !assignedInputIndexes.has(scene.inputIndex) ? [scene.inputIndex] : [],
      ));
      const situationRankings: AutomaticMemeRank[] = result.script.scenes.map(() => ({ by: "rule", items: [] }));
      if (missingInputIndexes.size) {
        const fallbackIndexes = result.script.scenes.flatMap((scene, index) => missingInputIndexes.has(scene.inputIndex) ? [index] : []);
        await Promise.all(fallbackIndexes.map(async index => {
          const scene = result.script!.scenes[index]!;
          try {
            const found = await api<{ items: MemeMeta[] }>("POST", "/api/library/memes/search", { q: scene.caption }, controller.signal);
            situationRankings[index] = { by: "rule", items: found.items };
            if (!found.items.length) return;
            const judged = await api<{ items: { id: string; fit: number }[] }>("POST", "/api/library/memes/judge", {
              q: scene.caption,
              ids: found.items.map(item => item.id),
              projectId: props.project.id,
            }, controller.signal);
            const byId = new Map(found.items.map(item => [item.id, item]));
            situationRankings[index] = { by: "jev", items: judged.items.flatMap(item => {
              const meme = byId.get(item.id);
              return meme ? [{ meme, fit: item.fit }] : [];
            }) };
          } catch (error) {
            if (controller.signal.aborted) throw error;
          }
        }));
      }
      const fallbackMemes = chooseMissingInputMemes(resolvedMemes.script, situationRankings, resolvedMemes.memes, resolvedMemes.alternateMemes);
      const resolvedWithFallback = {
        ...resolvedMemes,
        script: fallbackMemes.script,
        memes: fallbackMemes.memes,
        missingCount: combineMissingMemeCounts(resolvedMemes, fallbackMemes),
      };
      const script = resolvedWithFallback.script;
      const sfxItems = await api<SfxLibraryResponseItem[]>("GET", "/api/library/sfx", undefined, controller.signal).catch(() => []);
      const introSfx = await api<{ enabled: boolean; ref: string; atSec: number; durationSec: number }>("GET", "/api/system/intro-sfx", undefined, controller.signal).catch(() => ({ enabled: true, ref: "", atSec: 3, durationSec: 1.5 }));
      const sfxLibrary: Record<string, SfxLibraryItem[]> = {};
      for (const item of sfxItems) (sfxLibrary[item.category] ??= []).push({ ...item, file: item.ref });
      const timeline = timelineFromScript(script, inputs, { projectId: props.project.id, memes: resolvedWithFallback.memes, alternateMemes: resolvedMemes.alternateMemes, sfxLibrary, introSfx });
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, {
        ...props.project,
        inputs,
        timeline,
        savedAt: new Date().toISOString(),
      });
      props.onProject(saved);
      setGeneration({ phase: "idle", message: null, cancellable: false });
      const notices = [warning, resolvedWithFallback.missingCount ? `짤을 넣지 못한 장면 ${resolvedWithFallback.missingCount}개` : null].filter((notice): notice is string => Boolean(notice));
      props.onNotices?.(notices);
      props.onSnackbar(!props.onNotices && notices.length ? `대본을 만들었어요. ${notices.join(" · ")}` : "대본을 만들었어요");
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

  const workflowView = scriptGenerationView(generation);
  const error = workflowView.error ?? frameError;

  return (
    <section className="u3-shell flex h-full min-h-0 flex-col" aria-label="대본 방식 고르기">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <FlowIconButton label="미디어 넣기로 돌아가기" disabled={busy} onClick={props.onBack}><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /></FlowIconButton>
        <strong className="w-60 truncate pl-1">{props.project.name}</strong>
        <div className="flex min-w-0 flex-1 justify-center">
          <StepNav current="script" steps={[
            { id: "media", label: "미디어", disabled: busy },
            { id: "script", label: "대본", disabled: busy },
            { id: "studio", label: "스튜디오", disabled: !props.project.timeline.video.length || busy },
          ]} onStepChange={value => {
            if (value === "media") props.onBack();
            if (value === "studio") props.onStudio();
          }} />
        </div>
        <span className="w-[120px]" aria-hidden="true" />
      </header>
      <main className="flex min-h-0 flex-1 justify-center px-10 pt-7">
        <div className="flex w-full min-w-0 max-w-[880px] flex-col gap-4">
          <CodexWarning status={props.status} onSettings={props.onSettings} />
          {error && <Alert className="flex items-center gap-2.5 px-3 py-2.5">
            <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm" title={error}>{workflowView.error ? "대본을 만들지 못했어요" : "이미지를 준비하지 못했어요"} · {error}</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { if (frameError && !workflowView.error) setFrameAttempt(value => value + 1); else void generate(); }}>다시 시도</Button>
          </Alert>}
          <Tabs className="min-h-0 flex-1 gap-4" value={mode} onValueChange={value => setMode(value as "ai" | "direct")}>
            <div className="flex items-center justify-between gap-3">
              <TabsList className="w-[280px]" aria-label="대본 방식">
                <TabsTrigger value="ai" disabled={busy}>AI 추천</TabsTrigger>
                <TabsTrigger value="direct" disabled={busy}>직접 쓰기</TabsTrigger>
              </TabsList>
              {mode === "ai" && !loadingFrames && <span className="text-xs text-muted-foreground tabular-nums">프레임 {totalFrames}장</span>}
            </div>
            <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col overflow-y-auto data-[state=inactive]:hidden">
              <ScriptFrames loading={loadingFrames} groups={frames} inputs={inputs} />
            </TabsContent>
            <TabsContent value="direct" className="flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden">
              <label htmlFor="script-prompt" className="text-xs text-muted-foreground">간략한 대본</label>
              <Textarea id="script-prompt" className="min-h-[220px] flex-1 resize-none" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} />
            </TabsContent>
          </Tabs>
          {transcriptWarning && <Alert role="status" className="flex items-center gap-2.5 px-3 py-2.5">
            <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-sm">{transcriptWarning}</span>
          </Alert>}
          <footer className="mt-auto flex min-h-[72px] shrink-0 items-center justify-end gap-3 border-t border-border">
            {busy ? <ScriptProgress state={generation} progress={job?.progress ?? null} onCancel={() => void cancel()} /> : <Button disabled={!canGenerate || (mode === "ai" && loadingFrames)} onClick={() => void generate()}>대본 만들기</Button>}
          </footer>
        </div>
      </main>
    </section>
  );
}
