import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BRAND_SETTINGS, captionLayersOf, withCaptionLayers, type AudioClip, type BrandSettings, type ClipTransitionInput, type OverlayClip, type Project, type Timeline as TimelineData, type TransitionKind } from "../../core/schema";
import { clipDuration, deleteOverlayClip, moveVideoClip, overlayDuration, videoDuration, videoStartTimes, trimVideoClip, setCaptionRange } from "../../core/timeline/ops";
import { findOverlayInLayers, updateOverlayInLayers } from "../../core/timeline/overlay-layers";
import { BusyButton } from "../components/u3/BusyButton";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "../components/ui/alert-dialog";
import { api, watchJob, type EngineJob } from "../api";
import { clampTransitionDuration, parseTransitionDuration, transitionDurationLimit } from "./transition-length";
import { StudioTextInput, StudioSelect, RangeRow, SwitchRow } from "../components/u3/StudioControls";
import { PropertyRow } from "../components/u3/PropertyRow";
import { PropertySection } from "../components/u3/PropertySection";
import { CaptionLayerEditor } from "./CaptionLayerEditor";
import { CaptionTextFields } from "./CaptionEditor";
import { CaptionStyleEditor } from "./CaptionStyleEditor";
import { ttsOverflow } from "../../core/tts-clips";
import { plainCaptionText } from "../../core/captions";

import { clipSpeed, sourceAt, timelineOffsetOf } from "../../core/timeline/speed";

export type SpeedJob = { clipId: string; job: EngineJob | null; cancel: () => void };

interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }
type TranscriptResult = { captions: TimelineData["captions"]; replaced: TimelineData["captions"] };
export function Inspector(props: {
  onSpeed?: (clipId: string, track: "video" | "overlay" | "voice", speed: number) => void; speedJob?: SpeedJob | null;
  project: Project; selectedId: string | null; selectedIds: readonly string[]; selectedTrack: string | null; timeline: TimelineData;
  onChange: (timeline: TimelineData) => void; onProject: (project: Project) => void; onSnackbar: (message: string) => void; onUngroup: () => void;
  onDelete: () => void; onGenerateTts?: (captionId: string) => void; ttsBusy?: boolean; onProcessingChange?: (busy: boolean) => void; onOpenSettings?: () => void;
}) {
  const [sfxItems, setSfxItems] = useState<SfxItem[]>([]);
  const [job, setJob] = useState<EngineJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sttTarget, setSttTarget] = useState<"source" | "voice">("source");
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [confirmation, setConfirmation] = useState<"download-model" | "replace-captions" | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<TranscriptResult | null>(null);
  const busy = starting || Boolean(job && ["queued", "running"].includes(job.status));
  const blocked = busy || props.ttsBusy;
  const blockedTitle = blocked ? "다른 작업이 끝난 뒤 시작할 수 있어요" : undefined;
  useEffect(() => { props.onProcessingChange?.(busy); return () => props.onProcessingChange?.(false); }, [busy, props.onProcessingChange]);
  useEffect(() => {
    void api<SfxItem[]>("GET", "/api/library/sfx").then(setSfxItems).catch(() => undefined);
    void api<{ whisper: { available: boolean } }>("GET", "/api/models").then(m => setModelAvailable(m.whisper.available)).catch(() => setModelAvailable(false));
  }, []);
  const videoStarts = useMemo(() => videoStartTimes(props.timeline), [props.timeline]);
  const video = props.timeline.video.find(c => c.id === props.selectedId);
  const overlay = props.selectedId ? findOverlayInLayers(props.timeline.overlays, props.selectedId)?.clip : undefined;
  const layers = captionLayersOf(props.timeline);
  const caption = layers.flatMap(l => [...l.main, ...l.sub]).find(c => c.id === props.selectedId);
  const selectedLayer = layers.find(l => caption ? [...l.main, ...l.sub].some(c => c.id === caption.id) : l.id === props.selectedId || l.id === props.selectedId?.replace(/-(main|sub)$/, ""));
  const voiceClip = props.timeline.voice.find(c => c.id === props.selectedId);
  const sfxClip = props.timeline.sfx.find(c => c.id === props.selectedId);
  const selectedOpacityIds = props.selectedIds.length ? props.selectedIds : props.selectedId ? [props.selectedId] : [];
  const opacityValue = video?.opacity ?? overlay?.opacity ?? caption?.opacity ?? selectedLayer?.opacity ?? 1;
  const updateOpacity = (opacity: number) => {
    const ids = new Set(selectedOpacityIds);
    props.onChange(withCaptionLayers({ ...props.timeline, video: props.timeline.video.map(c => ids.has(c.id) ? { ...c, opacity } : c), overlays: props.timeline.overlays.map(l => l.map(c => ids.has(c.id) ? { ...c, opacity } : c)) }, layers.map(l => ({ ...l, ...(ids.has(l.id) ? { opacity } : {}), main: l.main.map(c => ids.has(c.id) ? { ...c, opacity } : c), sub: l.sub.map(c => ids.has(c.id) ? { ...c, opacity } : c) }))));
  };
  const sourceId = props.selectedId?.startsWith("source:") ? props.selectedId.slice(7) : props.selectedId?.startsWith("stem-") ? props.selectedId.split(":")[1] : null;
  const sourceClip = sourceId ? props.timeline.video.find(c => c.id === sourceId) : undefined;
  const input = sourceClip?.kind === "main" ? props.project.inputs.find(i => i.id === sourceClip.inputId) : undefined;
  const audioGain = props.timeline.audio;
  const separated = input ? audioGain.stems?.[input.id] : undefined;
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
    setStarting(true);
    const controller = new AbortController();
    try {
      await persistTimeline();
      const started = await api<EngineJob>("POST", `/api/projects/${props.project.id}/inputs/${input.id}/separate`);
      setJob(started);
      const finished = await watchJob(started.id, setJob, controller.signal);
      if (finished.status === "discarded") return;
      if (finished.status !== "done") throw new Error(finished.error ?? finished.message ?? "음성 분리를 마치지 못했어요.");
      const fresh = await api<Project>("GET", `/api/projects/${props.project.id}`);
      props.onChange(fresh.timeline);
      props.onProject(fresh);
      props.onSnackbar("목소리와 배경을 나눴어요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setStarting(false); }
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
    setStarting(true);
    try {
      const saved = await persistTimeline();
      const voiceClipId = props.selectedTrack === "voice" ? props.selectedId : saved.timeline.voice[0]?.id;
      const target = props.selectedTrack === "voice" || sttTarget === "voice"
        ? { kind: "voice", clipId: voiceClipId }
        : { kind: "source", inputId: input?.id };
      if (target.kind === "voice" && !target.clipId) throw new Error("받아 적을 음성 클립을 선택해 주세요.");
      if (target.kind === "source" && !target.inputId) throw new Error("받아 적을 영상 클립을 선택해 주세요.");
      const started = await api<EngineJob>("POST", `/api/projects/${props.project.id}/transcribe`, target);
      setJob(started);
      const finished = await watchJob(started.id, setJob, new AbortController().signal);
      if (finished.status === "discarded") return;
      if (finished.status !== "done") throw new Error(finished.error ?? finished.message ?? "자막을 만들지 못했어요.");
      const result = finished.result as { captions: TimelineData["captions"]; replaced: TimelineData["captions"] };
      if (result.replaced.length) {
        setPendingTranscript(result);
        setConfirmation("replace-captions");
        return;
      }
      await applyTranscript(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setStarting(false); }
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
        setJob(download);
        const result = await watchJob(download.id, setJob, new AbortController().signal);
        if (result.status === "discarded") return;
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

  const jobLine = busy ? <div className="studio-job" role="status"><span>{job?.message ?? "준비 중"}</span><Progress value={(job?.progress ?? 0) * 100} /><Button variant="outline" size="xs" disabled={!job?.cancellable} onClick={() => void cancelJob()}>취소</Button></div> : null;
  const speedControl = (clipId: string, track: "video" | "overlay" | "voice", speed: number) => props.selectedIds.length <= 1 ? <SpeedControl key={clipId} value={speed} onChange={v => props.onSpeed?.(clipId, track, v)} job={props.speedJob?.clipId === clipId ? props.speedJob : undefined} /> : null;
  const family = (id: string) => props.timeline.video.some(c => c.id === id) ? "video" : props.timeline.overlays.flat().some(c => c.id === id) ? "overlay" : layers.some(l => [...l.main, ...l.sub].some(c => c.id === id)) ? "caption" : props.timeline.voice.some(c => c.id === id) ? "voice" : "audio";
  if (new Set(props.selectedIds.map(family)).size > 1) return <InspectorShell title={`선택 ${props.selectedIds.length}개`} error={error} {...dialogProps}><OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} /><Button variant="ghost" className="text-u3-danger-text" onClick={props.onDelete}>삭제</Button></InspectorShell>;
  if (caption && selectedLayer) return <InspectorShell title="이 자막" error={error} {...dialogProps}>
    <CaptionTextFields timeline={props.timeline} clip={caption} layer={selectedLayer} onChange={props.onChange} />
    <PropertyRow label="시작" value="초"><StudioTextInput label="자막 시작" inputMode="decimal" value={String(caption.startSec)} onChange={v => { if (v.trim() && Number.isFinite(Number(v))) props.onChange(setCaptionRange(props.timeline, caption.id, Number(v), caption.endSec)); }} /></PropertyRow>
    <PropertyRow label="길이" value="초"><StudioTextInput label="자막 길이" inputMode="decimal" value={String(caption.endSec - caption.startSec)} onChange={v => { if (Number(v) > 0) props.onChange(setCaptionRange(props.timeline, caption.id, caption.startSec, caption.startSec + Number(v))); }} /></PropertyRow>
    <CaptionStyleEditor timeline={props.timeline} clip={caption} layer={selectedLayer} onChange={props.onChange} />
    <PropertySection title="레이어 스타일" defaultOpen={false}><CaptionLayerEditor project={props.project} timeline={props.timeline} layer={selectedLayer} onChange={props.onChange} /></PropertySection>
  </InspectorShell>;
  if (selectedLayer) return <InspectorShell title="레이어 스타일" error={error} {...dialogProps}><CaptionLayerEditor project={props.project} timeline={props.timeline} layer={selectedLayer} onChange={props.onChange} /></InspectorShell>;
  if (overlay) {
    const duration = overlayDuration(overlay);
    const update = (changes: Partial<OverlayClip>) => props.onChange({ ...props.timeline, overlays: updateOverlayInLayers(props.timeline.overlays, overlay.id, c => ({ ...c, ...changes } as OverlayClip)) });
    const count = overlay.groupId ? [...props.timeline.video, ...props.timeline.overlays.flat()].filter(c => c.groupId === overlay.groupId).length : 0;
    return <InspectorShell title="겹친 영상" error={error} {...dialogProps}>
      <OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} />
      {"inStartSec" in overlay && speedControl(overlay.id, "overlay", clipSpeed(overlay))}
      <RangeRow label="시작 시각" display={`${overlay.startSec.toFixed(1)}초`} min={0} max={Math.max(0, videoDuration(props.timeline) - duration)} step={0.1} value={overlay.startSec} onChange={startSec => update({ startSec })} />
      <PropertyRow label="길이" value="초"><StudioTextInput label="길이" inputMode="decimal" value={String(duration)} onChange={raw => { const v = Number(raw); if (v > 0 && v <= videoDuration(props.timeline) - overlay.startSec) update("durationSec" in overlay ? { durationSec: v } : { inEndSec: sourceAt(overlay, v) }); }} /></PropertyRow>
      <RangeRow label="가로 위치" display={`${Math.round(overlay.x * 100)}%`} min={0} max={1} step={0.01} value={overlay.x} onChange={x => update({ x })} />
      <RangeRow label="세로 위치" display={`${Math.round(overlay.y * 100)}%`} min={0} max={1} step={0.01} value={overlay.y} onChange={y => update({ y })} />
      <RangeRow label="폭" display={`${Math.round(overlay.width * 100)}%`} min={0.1} max={1} step={0.01} value={overlay.width} onChange={width => update({ width })} />
      <TransitionControl label="Start Transition" value={overlay.startTransition} durationSec={duration} onChange={startTransition => update({ startTransition })} />
      <TransitionControl label="End Transition" value={overlay.endTransition} durationSec={duration} onChange={endTransition => update({ endTransition })} />
      {count > 0 && <GroupSummary count={count} onUngroup={props.onUngroup} />}
      <Button variant="ghost" className="self-start text-u3-danger-text" onClick={() => props.onChange(deleteOverlayClip(props.timeline, overlay.id))}>삭제</Button>
    </InspectorShell>;
  }
  if (video) {
    const start = videoStarts[video.id]!;
    const duration = clipDuration(video);
    const groupCount = video.groupId ? [...props.timeline.video, ...props.timeline.overlays.flat()].filter(c => c.groupId === video.groupId).length : 0;
    const editTrim = (edge: "start" | "end", raw: string) => { if (raw.trim() && Number.isFinite(Number(raw))) { try { props.onChange(trimVideoClip(props.timeline, video.id, edge, start + ("inStartSec" in video ? timelineOffsetOf(video, Number(raw)) : Number(raw)), video.kind === "main" ? props.project.inputs.find(i => i.id === video.inputId)?.durationSec : undefined)); } catch (e) { setError(String(e)); } } };
    return <InspectorShell title={video.kind === "meme" ? "짤" : "영상 클립"} error={error} {...dialogProps}>
      <OpacityControl value={opacityValue} count={selectedOpacityIds.length} onChange={updateOpacity} />
      {"inStartSec" in video && speedControl(video.id, "video", clipSpeed(video))}
      {video.kind === "main" && "inStartSec" in video && <><PropertyRow label="원본 시작" value="초"><StudioTextInput label="원본 시작" inputMode="decimal" value={String(video.inStartSec)} onChange={v => editTrim("start", v)} /></PropertyRow><PropertyRow label="원본 끝" value="초"><StudioTextInput label="원본 끝" inputMode="decimal" value={String(video.inEndSec)} onChange={v => editTrim("end", v)} /></PropertyRow></>}
      {video.kind === "meme" && <><RangeRow label="길이" display={`${duration.toFixed(1)}초`} min={0.5} max={4} step={0.1} value={duration} onChange={durationSec => props.onChange({ ...props.timeline, video: props.timeline.video.map(c => c.id === video.id ? { ...video, durationSec } : c) })} /><PropertyRow label="순서"><Button variant="outline" size="xs" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.max(0, props.timeline.video.indexOf(video) - 1)))}>앞으로</Button><Button variant="outline" size="xs" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.min(props.timeline.video.length - 1, props.timeline.video.indexOf(video) + 1)))}>뒤로</Button></PropertyRow></>}
      <TransitionControl label="Start Transition" value={video.startTransition} durationSec={duration} onChange={value => updateVideoTransition(video.id, "startTransition", value, props.timeline, props.onChange)} />
      <TransitionControl label="End Transition" value={video.endTransition} durationSec={duration} onChange={value => updateVideoTransition(video.id, "endTransition", value, props.timeline, props.onChange)} />
      {(() => { const next = props.timeline.video[props.timeline.video.indexOf(video) + 1]; return video.endTransition && next?.startTransition && JSON.stringify(video.endTransition) !== JSON.stringify(next.startTransition) ? <p className="text-xs text-muted-foreground">뒤 클립의 Start Transition 을 써요</p> : null; })()}
      {groupCount > 0 && <PropertySection title="묶음" defaultOpen={false}><GroupSummary count={groupCount} onUngroup={props.onUngroup} /></PropertySection>}
      <p className="text-xs tabular-nums text-muted-foreground">{start.toFixed(1)}초 · {duration.toFixed(1)}초</p>
    </InspectorShell>;
  }
  if (voiceClip || sfxClip) {
    const clip = voiceClip ?? sfxClip!; const track = voiceClip ? "voice" : "sfx";
    return <InspectorShell title={track === "voice" ? "음성" : "효과음"} error={error} {...dialogProps}>
      {voiceClip && speedControl(voiceClip.id, "voice", clipSpeed(voiceClip))}
      <GainControl label="트랙 볼륨" gain={audioGain[track].gain} muted={audioGain[track].muted} onChange={v => updateGain(track, v)} onMute={() => toggleMute(track)} />
      <GainControl label="클립 볼륨" gain={clip.gain} onChange={v => updateClip(clip.id, { gain: v }, track)} />
      {track === "sfx" && <PropertyRow label="효과음"><StudioSelect label="효과음 바꾸기" value={clip.file} items={sfxItems.map(i => ({ value: i.ref, label: i.title }))} onChange={v => { const item = sfxItems.find(i => i.ref === v); if (item) updateClip(clip.id, { file: item.ref, inStartSec: 0, inEndSec: item.durationSec }, "sfx"); }} /></PropertyRow>}
      {track === "voice" && <><BusyButton variant="outline" disabled={blocked} title={blockedTitle} onClick={() => void createCaptions()}>자막 만들기</BusyButton>{clip.id.startsWith("tts-") && <><BusyButton variant="outline" disabled={blocked} title={blockedTitle} onClick={() => props.onGenerateTts?.(clip.id.slice(4))}>다시 만들기</BusyButton>{ttsOverflow(props.timeline, props.project.audioCache).some(c => c.id === clip.id) && <p role="status" className="text-xs text-muted-foreground">자막보다 음성이 길어요</p>}</>}{jobLine}</>}
    </InspectorShell>;
  }
  if (sourceClip && input) return <InspectorShell title={separated ? "분리한 소리" : "원본 소리"} error={error} {...dialogProps}>
    <PropertyRow label="배속" value={`${clipSpeed(sourceClip).toFixed(2)}×`} />
    {separated ? <>{(["voice", "bg"] as const).map(stem => <GainControl key={stem} label={stem === "voice" ? "목소리 볼륨" : "배경 볼륨"} gain={separated[stem].gain} muted={separated[stem].muted} onChange={gain => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, [stem]: { ...separated[stem], gain } } } } })} onMute={() => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, [stem]: { ...separated[stem], muted: !separated[stem].muted } } } } })} />)}<BusyButton variant="outline" disabled={blocked} title={blockedTitle} onClick={() => void revertSeparate()}>분리 되돌리기</BusyButton></> : <><GainControl label="볼륨" gain={audioGain.source.gain} muted={audioGain.source.muted} onChange={v => updateGain("source", v)} onMute={() => toggleMute("source")} /><BusyButton variant="outline" disabled={blocked} title={blockedTitle} onClick={() => void startSeparate()}>음성 분리</BusyButton></>}
    <PropertySection title="받아 적기"><PropertyRow label="대상"><StudioSelect label="받아 적기 대상" value={sttTarget} items={[{ value: "source", label: separated ? "목소리" : "원본 소리" }, { value: "voice", label: "음성" }]} onChange={v => setSttTarget(v as "source" | "voice")} /></PropertyRow><BusyButton variant="outline" disabled={blocked} title={blockedTitle} onClick={() => void createCaptions()}>자막 만들기</BusyButton>{jobLine}</PropertySection>
  </InspectorShell>;
  return <BrandInspector project={props.project} timeline={props.timeline} onChange={props.onChange} onProject={props.onProject} onSnackbar={props.onSnackbar} onlyWatermark={props.selectedTrack === "brand"} onOpenSettings={props.onOpenSettings} />;
}
function BrandInspector(props: { project: Project; timeline: TimelineData; onChange: (timeline: TimelineData) => void; onProject: (project: Project) => void; onSnackbar: (message: string) => void; onlyWatermark?: boolean; onOpenSettings?: () => void }) {
  const [defaults, setDefaults] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<typeof DEFAULT_BRAND_SETTINGS>("GET", "/api/system/brand").then(setDefaults).catch(() => undefined); }, []);
  const brand = props.timeline.brand ?? {};
  const watermark = brand.watermark ?? {};
  const titleBar = brand.titleBar ?? {};
  const titleKind = titleBar.kind ?? defaults.titleBar.kind;
  const updateWatermark = (changes: NonNullable<TimelineData["brand"]>["watermark"]) => props.onChange({ ...props.timeline, brand: { ...brand, watermark: { ...watermark, ...changes } } });
  const updateTitle = (changes: Partial<NonNullable<TimelineData["brand"]>["titleBar"]>) => props.onChange({ ...props.timeline, brand: { ...brand, titleBar: { ...titleBar, ...changes } } });
  const watermarkEnabled = watermark.enabled ?? Boolean(defaults.watermark?.file);
  const titleEnabled = titleBar.enabled ?? Boolean(titleKind === "image" ? defaults.titleBar.file : titleBar.text || defaults.titleBar.text);
  async function regenerateTitle() {
    setTitleGenerating(true);
    setError(null);
    try {
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, { ...props.project, timeline: props.timeline, savedAt: new Date().toISOString() });
      props.onProject(saved);
      const scenes = captionLayersOf(saved.timeline).flatMap(layer => layer.main.map(main => {
        const sub = layer.sub.find(item => item.startSec === main.startSec && item.endSec === main.endSec);
        return { caption: plainCaptionText(main.text), ...(sub ? { subCaption: plainCaptionText(sub.text) } : {}) };
      }));
      if (!scenes.length) throw new Error("제목을 만들 자막이 없습니다.");
      const result = await api<{ project: Project; title: string }>("POST", `/api/projects/${props.project.id}/title`, { scenes });
      const timeline = { ...saved.timeline, brand: { ...saved.timeline.brand, titleBar: { ...saved.timeline.brand?.titleBar, text: result.title } } };
      props.onChange(timeline);
      props.onProject({ ...result.project, timeline });
      props.onSnackbar("타이틀을 다시 만들었어요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setTitleGenerating(false); }
  }

  return <InspectorShell title={props.onlyWatermark ? "워터마크" : "브랜드"} error={error}>
    {!props.onlyWatermark && <h3 className="text-xs font-bold">워터마크</h3>}
    <SwitchRow label="켜기" checked={watermarkEnabled} onChange={enabled => updateWatermark({ enabled })} />
    {!defaults.watermark?.file && <Button variant="link" size="xs" className="self-start px-0" onClick={props.onOpenSettings}>설정에서 이미지 선택</Button>}
    <RangeRow label="가로 위치" display={`${Math.round((watermark.x ?? defaults.watermark?.x ?? 0.5) * 100)}%`} min={0} max={1} step={0.01} value={watermark.x ?? defaults.watermark?.x ?? 0.5} onChange={x => updateWatermark({ x })} />
    <RangeRow label="세로 위치" display={`${Math.round((watermark.y ?? defaults.watermark?.y ?? 0.08) * 100)}%`} min={0} max={1} step={0.01} value={watermark.y ?? defaults.watermark?.y ?? 0.08} onChange={y => updateWatermark({ y })} />
    <RangeRow label="폭" display={`${Math.round((watermark.width ?? defaults.watermark?.width ?? 0.2) * 100)}%`} min={0.01} max={1} step={0.01} value={watermark.width ?? defaults.watermark?.width ?? 0.2} onChange={width => updateWatermark({ width })} />
    <RangeRow label="투명도" display={`${Math.round((watermark.opacity ?? defaults.watermark?.opacity ?? 1) * 100)}%`} min={0} max={1} step={0.01} value={watermark.opacity ?? defaults.watermark?.opacity ?? 1} onChange={opacity => updateWatermark({ opacity })} />
    {!props.onlyWatermark && <PropertySection title="타이틀 바">
      <SwitchRow label="켜기" checked={titleEnabled} onChange={enabled => updateTitle({ enabled })} />
      <PropertyRow label="종류"><StudioSelect label="타이틀 내용 종류" value={titleKind} items={[{ value: "text", label: "글" }, { value: "image", label: "이미지" }]} onChange={kind => updateTitle({ kind: kind as "text" | "image" })} /></PropertyRow>
      {titleKind === "text" ? <><PropertyRow label="글"><StudioTextInput label="타이틀 글" maxLength={30} value={titleBar.text ?? defaults.titleBar.text ?? ""} onChange={text => updateTitle({ text: text.slice(0, 30) })} /></PropertyRow><Button variant="outline" disabled={titleGenerating || !captionLayersOf(props.timeline).some(l => l.main.length)} aria-busy={titleGenerating} onClick={() => void regenerateTitle()}>제목 다시 만들기</Button></> : !defaults.titleBar.file && <Button variant="link" size="xs" onClick={props.onOpenSettings}>설정에서 이미지 선택</Button>}
      <RangeRow label="높이" display={`${titleBar.height ?? defaults.titleBar.height}px`} min={40} max={600} step={1} value={titleBar.height ?? defaults.titleBar.height} onChange={height => updateTitle({ height })} />
      <RangeRow label="글자 크기" display={`${titleBar.fontSize ?? defaults.titleBar.fontSize}px`} min={12} max={200} step={1} value={titleBar.fontSize ?? defaults.titleBar.fontSize} onChange={fontSize => updateTitle({ fontSize })} />
      <RangeRow label="투명도" display={`${Math.round((titleBar.opacity ?? 1) * 100)}%`} min={0} max={1} step={0.01} value={titleBar.opacity ?? 1} onChange={opacity => updateTitle({ opacity })} />
    </PropertySection>}
  </InspectorShell>;
}
function updateVideoTransition(id: string, edge: "startTransition" | "endTransition", value: ClipTransitionInput, timeline: TimelineData, onChange: (timeline: TimelineData) => void) {
  onChange({ ...timeline, video: timeline.video.map((clip) => clip.id === id ? { ...clip, [edge]: value } : clip) });
}

function GroupSummary(props: { count: number; onUngroup: () => void }) {
  return <div className="studio-inspector-actions"><span className="studio-help">묶음 {props.count}개</span><Button variant="secondary" onClick={props.onUngroup}>묶음 풀기</Button></div>;
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
  return <PropertySection title={props.label} defaultOpen={false}>
    <div role="radiogroup" aria-label={`${props.label} 종류`} className="grid grid-cols-3 gap-1.5">{types.map(t => <Button key={t.value} role="radio" aria-checked={kind.kind === t.value} variant="outline" className={`h-auto min-w-0 flex-col gap-1 px-1 py-2 text-[10px] ${kind.kind === t.value ? "border-primary bg-primary/15" : ""}`} disabled={t.value !== "none" && maxDuration < 0.1} onClick={() => setKind(t.value)}><span className={`studio-transition-sample transition-${t.value}`} aria-hidden="true"><i /></span><span className="max-w-full truncate">{t.label}</span></Button>)}</div>
    {(kind.kind === "slide" || kind.kind === "wipe") && <PropertyRow label="방향"><StudioSelect label={`${props.label} 방향`} value={kind.direction} items={[{ value: "left", label: "왼쪽" }, { value: "right", label: "오른쪽" }, { value: "up", label: "위" }, { value: "down", label: "아래" }]} onChange={value => props.onChange({ kind: { ...kind, direction: value as "left" | "right" | "up" | "down" }, durationSec: duration })} /></PropertyRow>}
    {kind.kind !== "none" && <><RangeRow label="길이" display={`${duration.toFixed(1)}초`} min={0.1} max={maxDuration} step={0.1} value={duration} disabled={maxDuration < 0.1} onChange={v => { const next = clampTransitionDuration(v, props.durationSec); setDurationInput(String(next)); props.onChange({ kind, durationSec: next }); }} /><PropertyRow label="길이 입력" value="초"><StudioTextInput label={`${props.label} 길이`} inputMode="decimal" value={durationInput} disabled={maxDuration < 0.1} onChange={setDurationInput} onBlur={() => { const next = parseTransitionDuration(durationInput, props.durationSec, maxDuration, duration); setDurationInput(String(next)); props.onChange({ kind, durationSec: next }); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></PropertyRow></>}
  </PropertySection>;
}

function InspectorShell(p: { title: string; error?: string | null; confirmation?: "download-model" | "replace-captions" | null; onConfirm?: () => void; onCancel?: () => void; children: React.ReactNode }) {
  const critical = p.confirmation === "replace-captions";
  return <><aside className="studio-inspector" aria-label="속성"><h2>{p.title}</h2>{p.error && <Alert variant="destructive"><AlertDescription>{p.error}</AlertDescription></Alert>}<div className="studio-inspector-content">{p.children}</div></aside>
    <AlertDialog open={Boolean(p.confirmation)} onOpenChange={open => { if (!open) p.onCancel?.(); }}><AlertDialogContent aria-describedby={critical ? undefined : "stt-model-size"}><AlertDialogHeader><AlertDialogTitle>{critical ? "기존 자막을 바꿀까요?" : "STT 모델을 받을까요?"}</AlertDialogTitle>{!critical && <AlertDialogDescription id="stt-model-size">574 MB</AlertDialogDescription>}</AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={p.onCancel}>취소</AlertDialogCancel><AlertDialogAction variant="solid" onClick={p.onConfirm}>{critical ? "바꾸기" : "받기"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
function OpacityControl(p: { value: number; count: number; onChange: (value: number) => void }) { return <RangeRow label="투명도" display={`${Math.round(p.value * 100)}%`} min={0} max={1} step={0.01} value={p.value} onChange={p.onChange} />; }
function GainControl(p: { label: string; gain: number; muted?: boolean; onChange: (value: number) => void; onMute?: () => void }) { return <><RangeRow label={p.label} display={`${Math.round(p.gain * 100)}%`} min={0} max={1.5} step={0.01} value={p.gain} onChange={p.onChange} />{p.onMute && <SwitchRow label="음소거" checked={Boolean(p.muted)} onChange={p.onMute} />}</>; }


export function parseSpeedInput(raw: string): number {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value < 0.5 || value > 2 || Math.abs(value * 20 - Math.round(value * 20)) > 1e-8) throw new RangeError("0.50–2.00 사이에서 0.05 단위로 입력해 주세요");
  return value;
}

function SpeedControl(p: { value: number; onChange: (value: number) => void; job?: SpeedJob }) {
  const [draft, setDraft] = useState(p.value.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const escaped = useRef(false);
  useEffect(() => { setDraft(p.value.toFixed(2)); setError(null); }, [p.value]);
  const commit = () => {
    if (escaped.current) { escaped.current = false; return; }
    try { const value = parseSpeedInput(draft); setDraft(value.toFixed(2)); setError(null); if (value !== p.value) p.onChange(value); }
    catch (e) { setError((e as Error).message); }
  };
  return <><PropertyRow label="배속" value={`${p.value.toFixed(2)}×`}><StudioTextInput label="배속" inputMode="decimal" value={draft} disabled={Boolean(p.job)} aria-invalid={Boolean(error)} onChange={setDraft} onBlur={commit} onKeyDown={e => {
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    if (e.key === "Escape") { e.stopPropagation(); escaped.current = true; setDraft(p.value.toFixed(2)); setError(null); e.currentTarget.blur(); }
  }} /></PropertyRow>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}{p.job && <div className="studio-job" role="status"><span>{p.job.job?.message ?? "배속 준비 중"}</span><Progress value={(p.job.job?.progress ?? 0) * 100} /><Button variant="outline" size="xs" onClick={p.job.cancel}>취소</Button></div>}</>;
}
