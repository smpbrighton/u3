import { useEffect, useMemo, useState } from "react";
import type { AudioClip, ClipTransitionInput, OverlayClip, Project, Timeline as TimelineData, TransitionKind } from "../../core/schema";
import { captionLayersOf, withCaptionLayers } from "../../core/schema";
import { deleteOverlayClip, moveVideoClip, overlayDuration, videoDuration, videoStartTimes } from "../../core/timeline/ops";
import { findOverlayInLayers, updateOverlayInLayers } from "../../core/timeline/overlay-layers";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { AlertDialogRoot, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "../../../seed-design/ui/alert-dialog";
import { api, watchJob, type EngineJob } from "../api";
import { clampTransitionDuration, parseTransitionDuration, transitionDurationLimit } from "./transition-length";
import { StudioSlider, StudioSwitch, StudioTextInput, StudioTextarea, StudioSelect } from "./SeedControls";
import { RadioGroup, RadioGroupItem } from "../../../seed-design/ui/radio-group";
import { CaptionLayerEditor } from "./CaptionLayerEditor";

const AlertDialog = { Root: AlertDialogRoot, Content: AlertDialogContent, Header: AlertDialogHeader, Title: AlertDialogTitle, Description: AlertDialogDescription, Footer: AlertDialogFooter, Action: AlertDialogAction };

interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }
type TranscriptResult = { captions: TimelineData["captions"]; replaced: TimelineData["captions"] };

export function Inspector(props: {
  project: Project;
  selectedId: string | null;
  selectedIds: readonly string[];
  selectedTrack: string | null;
  timeline: TimelineData;
  onChange: (timeline: TimelineData) => void;
  onProject: (project: Project) => void;
  onSnackbar: (message: string) => void;
  onUngroup: () => void;
}) {
  const [sfxItems, setSfxItems] = useState<SfxItem[]>([]);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sttTarget, setSttTarget] = useState<"source" | "voice">("source");
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [confirmation, setConfirmation] = useState<"download-model" | "replace-captions" | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<TranscriptResult | null>(null);

  useEffect(() => {
    void api<SfxItem[]>("GET", "/api/library/sfx").then(setSfxItems).catch(() => undefined);
    void api<{ whisper: { available: boolean } }>("GET", "/api/models").then((models) => setModelAvailable(models.whisper.available)).catch(() => setModelAvailable(false));
  }, []);

  const videoStarts = useMemo(() => videoStartTimes(props.timeline), [props.timeline]);
  const video = props.timeline.video.find((clip) => clip.id === props.selectedId);
  const overlay = props.selectedId ? findOverlayInLayers(props.timeline.overlays, props.selectedId)?.clip : undefined;
  const caption = captionLayersOf(props.timeline).flatMap((layer) => [...layer.main, ...layer.sub]).find((clip) => clip.id === props.selectedId);
  const editableCaption = captionLayersOf(props.timeline)[0]?.main.find((clip) => clip.id === props.selectedId);
  const voiceClip = props.timeline.voice.find((clip) => clip.id === props.selectedId);
  const sfxClip = props.timeline.sfx.find((clip) => clip.id === props.selectedId);
  const selectedOpacityIds = props.selectedIds.length ? props.selectedIds : props.selectedId ? [props.selectedId] : [];
  const selectedOpacity = selectedOpacityIds.map((id) => {
    const layer = captionLayersOf(props.timeline).find((item) => item.id === id);
    const videoClip = props.timeline.video.find((item) => item.id === id);
    const overlayClip = findOverlayInLayers(props.timeline.overlays, id)?.clip;
    const captionClip = captionLayersOf(props.timeline).flatMap((item) => [...item.main, ...item.sub]).find((item) => item.id === id);
    return layer?.opacity ?? videoClip?.opacity ?? overlayClip?.opacity ?? captionClip?.opacity;
  }).filter((value): value is number => value !== undefined);
  const opacityValue = selectedOpacity.length ? selectedOpacity[0]! : 1;
  const updateOpacity = (opacity: number) => {
    if (props.selectedTrack === "caption-layer") {
      props.onChange(withCaptionLayers(props.timeline, captionLayersOf(props.timeline).map((layer) => layer.id === props.selectedId ? { ...layer, opacity } : layer)));
      return;
    }
    if (props.selectedTrack === "brand") {
      props.onChange({ ...props.timeline, brand: { ...props.timeline.brand, watermark: { ...props.timeline.brand?.watermark, opacity } } });
      return;
    }
    const ids = new Set(selectedOpacityIds);
    const videoClips = props.timeline.video.map((clip) => ids.has(clip.id) ? { ...clip, opacity } : clip);
    const overlays = props.timeline.overlays.map((layer) => layer.map((clip) => ids.has(clip.id) ? { ...clip, opacity } as OverlayClip : clip));
    const layers = captionLayersOf(props.timeline).map((layer) => ({ ...layer, main: layer.main.map((clip) => ids.has(clip.id) ? { ...clip, opacity } : clip), sub: layer.sub.map((clip) => ids.has(clip.id) ? { ...clip, opacity } : clip) }));
    props.onChange(withCaptionLayers({ ...props.timeline, video: videoClips, overlays }, layers));
  };
  const sourceId = props.selectedId?.startsWith("source:") ? props.selectedId.slice("source:".length) : props.selectedId?.startsWith("stem-") ? props.selectedId.split(":")[1] : null;
  const sourceClip = sourceId ? props.timeline.video.find((clip) => clip.id === sourceId) : undefined;
  const input = sourceClip?.kind === "main" ? props.project.inputs.find((item) => item.id === sourceClip.inputId) : undefined;
  const audioGain = props.timeline.audio;
  const separated = input ? audioGain.stems?.[input.id] : undefined;

  const selectedLayerId = props.selectedTrack?.replace(/-(main|sub)$/, "");
  const selectedLayer = captionLayersOf(props.timeline).find(layer => layer.id === selectedLayerId);
  if (selectedLayer) return <InspectorShell title={`${selectedLayer.name} 편집`} error={error}><CaptionLayerEditor project={props.project} timeline={props.timeline} layer={selectedLayer} onChange={props.onChange} /></InspectorShell>;

  if (overlay) {
    const duration = overlayDuration(overlay);
    const updateOverlay = (changes: { startSec?: number; durationSec?: number; inEndSec?: number; x?: number; y?: number; width?: number; startTransition?: ClipTransitionInput; endTransition?: ClipTransitionInput }) => props.onChange({ ...props.timeline, overlays: updateOverlayInLayers(props.timeline.overlays, overlay.id, (item) => ({ ...item, ...changes } as OverlayClip)) });
    const groupCount = overlay.groupId ? props.timeline.overlays.flat().filter((item) => item.groupId === overlay.groupId).length : 0;
    return <InspectorShell title={`${props.selectedTrack === "video" ? "영상 2" : props.selectedTrack?.replace(/^video-/, "영상 ") ?? "영상 2"} 속성`} error={error}>
      {groupCount ? <GroupSummary count={groupCount} onUngroup={props.onUngroup} /> : null}
      <OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} />
      <label>시작 시각 <b>{overlay.startSec.toFixed(1)}초</b><StudioSlider label="시작 시각" min={0} max={Math.max(0, videoDuration(props.timeline) - duration)} step={0.1} value={Math.min(overlay.startSec, Math.max(0, videoDuration(props.timeline) - duration))} onChange={value => updateOverlay({ startSec: value })} /></label>
      <label>길이 <b>{duration.toFixed(1)}초</b><StudioTextInput label="길이" inputMode="decimal" value={String(duration)} onChange={raw => {
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0 || value > videoDuration(props.timeline) - overlay.startSec) return;
        updateOverlay("durationSec" in overlay ? { durationSec: value } : { inEndSec: overlay.inStartSec + value });
      }} /></label>
      <label>가로 위치 <b>{Math.round(overlay.x * 100)}%</b><StudioSlider label="가로 위치" min={0} max={1} step={0.01} value={overlay.x} onChange={x => updateOverlay({ x })} /></label>
      <label>세로 위치 <b>{Math.round(overlay.y * 100)}%</b><StudioSlider label="세로 위치" min={0} max={1} step={0.01} value={overlay.y} onChange={y => updateOverlay({ y })} /></label>
      <label>폭 <b>{Math.round(overlay.width * 100)}%</b><StudioSlider label="폭" min={0.1} max={1} step={0.01} value={overlay.width} onChange={width => updateOverlay({ width })} /></label>
      <TransitionControl label="시작 효과" value={overlay.startTransition} durationSec={duration} onChange={(value) => updateOverlay({ startTransition: value })} />
      <TransitionControl label="끝 효과" value={overlay.endTransition} durationSec={duration} onChange={(value) => updateOverlay({ endTransition: value })} />
      <p className="studio-help">앞 클립의 끝 효과와 다르면 뒤 클립의 시작 효과를 씁니다.</p>
      <ActionButton variant="neutralWeak" onClick={() => props.onChange(deleteOverlayClip(props.timeline, overlay.id))}>겹친 영상 삭제</ActionButton>
    </InspectorShell>;
  }

  const updateGain = (track: "source" | "voice" | "sfx", gain: number) => props.onChange({ ...props.timeline, audio: { ...audioGain, [track]: { ...audioGain[track], gain } } });
  const toggleMute = (track: "source" | "voice" | "sfx") => props.onChange({ ...props.timeline, audio: { ...audioGain, [track]: { ...audioGain[track], muted: !audioGain[track].muted } } });
  const updateClip = (clipId: string, changes: Partial<AudioClip>, track: "voice" | "sfx") => {
    const clips = props.timeline[track].map((clip) => clip.id === clipId ? { ...clip, ...changes } : clip);
    props.onChange({ ...props.timeline, [track]: clips });
  };

  async function persistTimeline(): Promise<Project> {
    const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, { ...props.project, timeline: props.timeline, savedAt: new Date().toISOString() });
    props.onProject(saved);
    return saved;
  }

  async function startSeparate() {
    if (!input || input.kind !== "video") return;
    setError(null);
    const controller = new AbortController();
    try {
      await persistTimeline();
      const started = await api<EngineJob>("POST", `/api/projects/${props.project.id}/inputs/${input.id}/separate`);
      const finished = await watchJob(started.id, setJob, controller.signal);
      if (finished.status !== "done") throw new Error(finished.error ?? finished.message ?? "음성 분리를 마치지 못했어요.");
      const fresh = await api<Project>("GET", `/api/projects/${props.project.id}`);
      props.onChange(fresh.timeline);
      props.onProject(fresh);
      props.onSnackbar("목소리와 배경을 나눴어요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function cancelJob() {
    if (!job?.cancellable) return;
    await api("DELETE", `/api/jobs/${job.id}`).catch(() => undefined);
    setJob({ ...job, status: "discarded", message: "취소했어요." });
  }

  async function revertSeparate() {
    if (!input) return;
    try {
      await persistTimeline();
      await api("DELETE", `/api/projects/${props.project.id}/inputs/${input.id}/separate`);
      const fresh = await api<Project>("GET", `/api/projects/${props.project.id}`);
      props.onChange(fresh.timeline);
      props.onProject(fresh);
      props.onSnackbar("원본 소리로 되돌렸어요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function createCaptions() {
    if (modelAvailable === false) {
      setConfirmation("download-model");
      return;
    }
    await runTranscription();
  }

  async function runTranscription() {
    setError(null);
    try {
      const saved = await persistTimeline();
      const voiceClipId = props.selectedTrack === "voice" ? props.selectedId : saved.timeline.voice[0]?.id;
      const target = props.selectedTrack === "voice" || sttTarget === "voice"
        ? { kind: "voice", clipId: voiceClipId }
        : { kind: "source", inputId: input?.id };
      if (!target.clipId && sttTarget === "voice") throw new Error("받아 적을 음성 클립을 선택해 주세요.");
      if (!target.inputId && sttTarget === "source") throw new Error("받아 적을 영상 클립을 선택해 주세요.");
      const started = await api<EngineJob>("POST", `/api/projects/${props.project.id}/transcribe`, target);
      const finished = await watchJob(started.id, setJob, new AbortController().signal);
      if (finished.status !== "done") throw new Error(finished.error ?? finished.message ?? "자막을 만들지 못했어요.");
      const result = finished.result as { captions: TimelineData["captions"]; replaced: TimelineData["captions"] };
      if (result.replaced.length) {
        setPendingTranscript(result);
        setConfirmation("replace-captions");
        return;
      }
      await applyTranscript(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function applyTranscript(result: TranscriptResult) {
    try {
      const applied = await api<{ project: Project }>("POST", `/api/projects/${props.project.id}/transcribe/apply`, {
        captions: result.captions,
        replaceIds: result.replaced.map((item) => item.id),
      });
      props.onChange(applied.project.timeline);
      props.onProject(applied.project);
      props.onSnackbar("말소리로 자막을 만들었어요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function confirmAction() {
    const action = confirmation;
    setConfirmation(null);
    if (action === "download-model") {
      try {
        const download = await api<EngineJob>("POST", "/api/models/download", { model: "whisper" });
        const result = await watchJob(download.id, setJob, new AbortController().signal);
        if (result.status !== "done") throw new Error(result.error ?? "모델을 받지 못했어요.");
        setModelAvailable(true);
        await runTranscription();
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
      return;
    }
    if (action === "replace-captions" && pendingTranscript) {
      const result = pendingTranscript;
      setPendingTranscript(null);
      await applyTranscript(result);
    }
  }

  const dialogProps = {
    confirmation,
    onConfirm: () => void confirmAction(),
    onCancel: () => { setConfirmation(null); setPendingTranscript(null); },
  };

  if (video) {
    const start = videoStarts[video.id]!;
    const selectedInput = video.kind === "main" ? props.project.inputs.find((item) => item.id === video.inputId) : undefined;
    const duration = "durationSec" in video ? video.durationSec : video.inEndSec - video.inStartSec;
    const groupCount = video.groupId ? props.timeline.video.filter((item) => item.groupId === video.groupId).length : 0;
    const editTrim = (edge: "start" | "end", value: number) => {
      if (video.kind !== "main" || !("inStartSec" in video)) return;
      const updated = props.timeline.video.map((item) => item.id === video.id ? { ...video, [edge === "start" ? "inStartSec" : "inEndSec"]: value } : item);
      props.onChange({ ...props.timeline, video: updated });
    };
    return <InspectorShell title={video.kind === "meme" ? "짤 속성" : "영상 클립"} error={error} {...dialogProps}>
      <OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} />
      {groupCount ? <GroupSummary count={groupCount} onUngroup={props.onUngroup} /> : null}
      {video.kind === "main" && "inStartSec" in video ? <div className="studio-inspector-grid">
        <StudioTextInput label="원본 시작" inputMode="decimal" value={String(video.inStartSec)} onChange={value => { if (value !== "") editTrim("start", Number(value)); }} />
        <StudioTextInput label="원본 끝" inputMode="decimal" value={String(video.inEndSec)} onChange={value => { if (value !== "") editTrim("end", Number(value)); }} />
      </div> : null}
      {video.kind === "meme" ? <>
        <label className="studio-range-label">길이 <b>{duration.toFixed(1)}초</b><StudioSlider label="길이" min={0.5} max={4} step={0.1} value={duration} onChange={value => props.onChange({ ...props.timeline, video: props.timeline.video.map((item) => item.id === video.id ? { ...video, durationSec: value } : item) })} /></label>
        <div className="studio-inspector-actions"><ActionButton variant="neutralWeak" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.max(0, props.timeline.video.findIndex((item) => item.id === video.id) - 1)))}>본 화면 앞</ActionButton><ActionButton variant="ghost" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.min(props.timeline.video.length - 1, props.timeline.video.findIndex((item) => item.id === video.id) + 1)))}>본 화면 뒤</ActionButton></div>
        <p className="studio-help">왼쪽에서 다른 짤을 누르면 바꿔요.</p>
      </> : <CaptionEditor caption={captionLayersOf(props.timeline)[0]?.main.find((item) => item.startSec <= start + duration && item.endSec >= start)} timeline={props.timeline} onChange={props.onChange} />}
      <TransitionControl label="시작 효과" value={video.startTransition} durationSec={duration} onChange={(value) => updateVideoTransition(video.id, "startTransition", value, props.timeline, props.onChange)} />
      <TransitionControl label="끝 효과" value={video.endTransition} durationSec={duration} onChange={(value) => updateVideoTransition(video.id, "endTransition", value, props.timeline, props.onChange)} />
      <p className="studio-help">앞 클립의 끝 효과와 다르면 뒤 클립의 시작 효과를 씁니다.</p>
      <p className="studio-help">클립 위치 {start.toFixed(1)}초 · 길이 {duration.toFixed(1)}초</p>
    </InspectorShell>;
  }

  if (props.selectedTrack === "caption-layer") {
    const layer = captionLayersOf(props.timeline).find((item) => item.id === props.selectedId);
    if (layer) return <InspectorShell title={`${layer.name} 투명도`} error={error} {...dialogProps}><OpacityControl value={layer.opacity ?? 1} count={1} onChange={updateOpacity} /></InspectorShell>;
  }
  if (props.selectedTrack === "brand") return <InspectorShell title="워터마크 속성" error={error} {...dialogProps}><OpacityControl value={props.timeline.brand?.watermark?.opacity ?? 1} count={1} onChange={updateOpacity} /></InspectorShell>;
  if (caption) return <InspectorShell title="자막 속성" error={error} {...dialogProps}><OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} />{editableCaption ? <StudioTextarea label="자막" rows={4} value={editableCaption.text} onChange={value => updateCaptionText(props.timeline, editableCaption.id, value, props.onChange)} /> : null}</InspectorShell>;
  if (voiceClip || sfxClip) {
    const clip = voiceClip ?? sfxClip!;
    const track = voiceClip ? "voice" : "sfx";
    return <InspectorShell title={track === "voice" ? "음성 속성" : "효과음 속성"} error={error} {...dialogProps}>
      <GainControl label="트랙 볼륨" gain={audioGain[track].gain} muted={audioGain[track].muted} onChange={(value) => updateGain(track, value)} onMute={() => toggleMute(track)} />
      <GainControl label="클립 볼륨" gain={clip.gain} onChange={(value) => updateClip(clip.id, { gain: value }, track)} />
      {track === "sfx" ? <StudioSelect label="효과음 바꾸기" value={clip.file} items={sfxItems.map(item => ({ value: item.ref, label: item.title }))} onChange={value => { const item = sfxItems.find((sfx) => sfx.ref === value); if (item) updateClip(clip.id, { file: item.ref, inStartSec: 0, inEndSec: item.durationSec }, "sfx"); }} /> : null}
      {track === "voice" ? <p className="studio-help">선택한 음성 클립에서 받아 적어요.</p> : null}
      {track === "voice" ? <ActionButton variant="neutralWeak" onClick={() => void createCaptions()}>자막 만들기</ActionButton> : null}
    </InspectorShell>;
  }

  if (sourceClip && input) return <InspectorShell title={separated ? "분리한 소리" : "원본 소리"} error={error} {...dialogProps}>
    {separated ? <>
      <GainControl label="목소리" gain={separated.voice.gain} muted={separated.voice.muted} onChange={(value) => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, voice: { ...separated.voice, gain: value } } } } })} onMute={() => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, voice: { ...separated.voice, muted: !separated.voice.muted } } } } })} />
      <GainControl label="배경" gain={separated.bg.gain} muted={separated.bg.muted} onChange={(value) => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, bg: { ...separated.bg, gain: value } } } } })} onMute={() => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, bg: { ...separated.bg, muted: !separated.bg.muted } } } } })} />
      <ActionButton variant="neutralWeak" onClick={() => void revertSeparate()}>분리 되돌리기</ActionButton>
      <RadioGroup aria-label="받아 적을 트랙" value={sttTarget} onValueChange={value => setSttTarget(value as "source" | "voice")}><RadioGroupItem value="source" label="목소리 트랙" /><RadioGroupItem value="voice" label="음성 트랙" /></RadioGroup>
      <ActionButton variant="neutralWeak" onClick={() => void createCaptions()}>자막 만들기</ActionButton>
    </> : <>
      <GainControl label="원본 소리 볼륨" gain={audioGain.source.gain} muted={audioGain.source.muted} onChange={(value) => updateGain("source", value)} onMute={() => toggleMute("source")} />
      <ActionButton variant="neutralWeak" onClick={() => void startSeparate()}>음성 분리</ActionButton>
      <RadioGroup aria-label="받아 적을 트랙" value={sttTarget} onValueChange={value => setSttTarget(value as "source" | "voice")}><RadioGroupItem value="source" label="원본 소리" /><RadioGroupItem value="voice" label="음성" /></RadioGroup>
      <ActionButton variant="neutralWeak" onClick={() => void createCaptions()}>자막 만들기</ActionButton>
    </>}
    {job && ["queued", "running"].includes(job.status) ? <div className="studio-job"><ProgressCircle size="24" tone="brand" value={job.progress === null ? undefined : job.progress * 100} /><span>{job.message ?? "작업 중이에요."}</span><ActionButton variant="ghost" size="small" onClick={() => void cancelJob()}>취소</ActionButton></div> : null}
  </InspectorShell>;

  return <InspectorShell title="속성" {...dialogProps}><p className="studio-help">클립을 선택하면 속성을 편집할 수 있어요.</p></InspectorShell>;
}

function updateVideoTransition(id: string, edge: "startTransition" | "endTransition", value: ClipTransitionInput, timeline: TimelineData, onChange: (timeline: TimelineData) => void) {
  onChange({ ...timeline, video: timeline.video.map((clip) => clip.id === id ? { ...clip, [edge]: value } : clip) });
}

function GroupSummary(props: { count: number; onUngroup: () => void }) {
  return <div className="studio-inspector-actions"><span className="studio-help">묶음 {props.count}개 클립</span><ActionButton variant="neutralWeak" onClick={props.onUngroup}>묶음 풀기</ActionButton></div>;
}

function TransitionControl(props: { label: string; value?: ClipTransitionInput; durationSec: number; onChange: (value: ClipTransitionInput) => void }) {
  const kind = props.value?.kind ?? { kind: "none" as const };
  const maxDuration = transitionDurationLimit(props.durationSec);
  const duration = clampTransitionDuration(props.value?.durationSec ?? 0.5, props.durationSec);
  const [durationInput, setDurationInput] = useState(String(duration));
  useEffect(() => setDurationInput(String(duration)), [duration]);
  const types: { value: TransitionKind["kind"]; label: string }[] = [
    { value: "none", label: "없음" }, { value: "dissolve", label: "디졸브" }, { value: "black-fade", label: "검은 화면 페이드" },
    { value: "slide", label: "밀기" }, { value: "wipe", label: "와이프" }, { value: "iris", label: "원형 열기" }, { value: "zoom", label: "확대 전환" },
  ];
  const setKind = (name: TransitionKind["kind"]) => {
    if (name !== "none" && maxDuration < 0.1) return;
    let nextKind: TransitionKind;
    if (name === "slide" || name === "wipe") nextKind = { kind: name, direction: kind.kind === name ? kind.direction : "left" };
    else nextKind = { kind: name } as TransitionKind;
    const nextDuration = name === "none" || maxDuration < 0.1 ? 0.5 : Math.max(0.1, Math.min(maxDuration, duration));
    props.onChange({ kind: nextKind, durationSec: nextDuration });
  };
  return <fieldset className="studio-transition-control">
    <StudioSelect label={props.label} value={kind.kind} items={types.map(item => ({ ...item, disabled: item.value !== "none" && maxDuration < 0.1 }))} onChange={value => setKind(value as TransitionKind["kind"])} />
    {kind.kind === "slide" || kind.kind === "wipe" ? <StudioSelect label={`${props.label} 방향`} value={kind.direction} items={[{ value: "left", label: "왼쪽" }, { value: "right", label: "오른쪽" }, { value: "up", label: "위" }, { value: "down", label: "아래" }]} onChange={value => props.onChange({ kind: { ...kind, direction: value as "left" | "right" | "up" | "down" }, durationSec: duration })} /> : null}
    {kind.kind !== "none" ? <>
      <label className="studio-range-label">길이 <b>{duration.toFixed(1)}초</b><StudioSlider label={`${props.label} 길이 조절`} min={0.1} max={maxDuration} step={0.1} value={duration} disabled={maxDuration < 0.1} onChange={(value) => {
        const next = clampTransitionDuration(value, props.durationSec);
        setDurationInput(String(next)); props.onChange({ kind, durationSec: next });
      }} /></label>
      <StudioTextInput label={`${props.label} 길이`} inputMode="decimal" value={durationInput} disabled={maxDuration < 0.1} onChange={setDurationInput} onBlur={() => {
        const next = parseTransitionDuration(durationInput, props.durationSec, maxDuration, duration);
        setDurationInput(String(next)); props.onChange({ kind, durationSec: next });
      }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </> : null}
  </fieldset>;
}

function InspectorShell(props: {
  title: string;
  error?: string | null;
  confirmation?: "download-model" | "replace-captions" | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  children: React.ReactNode;
}) {
  const critical = props.confirmation === "replace-captions";
  return <>
    <aside className="studio-inspector" aria-label="속성"><h2>{props.title}</h2>{props.error ? <PageBanner tone="warning" variant="weak" description={props.error} /> : null}<div className="studio-inspector-content">{props.children}</div></aside>
    <AlertDialog.Root open={Boolean(props.confirmation)} onOpenChange={open => { if (!open) props.onCancel?.(); }}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{critical ? "기존 자막을 바꿀까요?" : "whisper 모델을 받을까요?"}</AlertDialog.Title>
          <AlertDialog.Description>{critical ? "기존 자막을 새 자막으로 바꿔요." : "받아 적기 모델을 받으려면 574 MB가 필요해요."}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <ActionButton variant="neutralWeak" onClick={props.onCancel}>취소</ActionButton>
          <AlertDialog.Action asChild><ActionButton variant={critical ? "criticalSolid" : "neutralWeak"} onClick={props.onConfirm}>{critical ? "바꾸기" : "받기"}</ActionButton></AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </>;
}

function OpacityControl(props: { value: number; count: number; onChange: (value: number) => void }) {
  return <label className="studio-range-label">투명도{props.count > 1 ? ` (${props.count}개)` : ""} <b>{Math.round(props.value * 100)}%</b><StudioSlider label="투명도" min={0} max={1} step={0.01} value={props.value} onChange={props.onChange} /></label>;
}

function GainControl(props: { label: string; gain: number; muted?: boolean; onChange: (value: number) => void; onMute?: () => void }) {
  return <div className="studio-range-label">{props.label} <b>{Math.round(props.gain * 100)}%</b><StudioSlider label={props.label} min={0} max={1.5} step={0.01} value={props.gain} onChange={props.onChange} />{props.onMute ? <StudioSwitch label={`${props.label} 음소거`} checked={Boolean(props.muted)} onChange={props.onMute} /> : null}</div>;
}

function CaptionEditor(props: { caption?: TimelineData["captions"][number]; timeline: TimelineData; onChange: (timeline: TimelineData) => void }) {
  if (!props.caption) return null;
  return <StudioTextarea label="자막" rows={3} value={props.caption.text} onChange={value => updateCaptionText(props.timeline, props.caption!.id, value, props.onChange)} />;
}

function updateCaptionText(timeline: TimelineData, id: string, text: string, onChange: (timeline: TimelineData) => void) {
  const layers = captionLayersOf(timeline);
  onChange(withCaptionLayers(timeline, layers.map(layer => ({ ...layer, main: layer.main.map(clip => clip.id === id ? { ...clip, text } : clip), sub: layer.sub.map(clip => clip.id === id ? { ...clip, text } : clip) }))));
}
