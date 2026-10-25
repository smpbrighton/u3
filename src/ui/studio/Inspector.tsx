import { useEffect, useMemo, useState } from "react";
import type { AudioClip, OverlayClip, Project, Timeline as TimelineData } from "../../core/schema";
import { deleteOverlayClip, moveVideoClip, overlayDuration, videoDuration, videoStartTimes } from "../../core/timeline/ops";
import { findOverlayInLayers, updateOverlayInLayers } from "../../core/timeline/overlay-layers";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { AlertDialog } from "@seed-design/react";
import { api, watchJob, type EngineJob } from "../api";

interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }
type TranscriptResult = { captions: TimelineData["captions"]; replaced: TimelineData["captions"] };

export function Inspector(props: {
  project: Project;
  selectedId: string | null;
  selectedTrack: string | null;
  timeline: TimelineData;
  onChange: (timeline: TimelineData) => void;
  onProject: (project: Project) => void;
  onSnackbar: (message: string) => void;
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
  const caption = props.timeline.captions.find((clip) => clip.id === props.selectedId);
  const voiceClip = props.timeline.voice.find((clip) => clip.id === props.selectedId);
  const sfxClip = props.timeline.sfx.find((clip) => clip.id === props.selectedId);
  const sourceId = props.selectedId?.startsWith("source:") ? props.selectedId.slice("source:".length) : props.selectedId?.startsWith("stem-") ? props.selectedId.split(":")[1] : null;
  const sourceClip = sourceId ? props.timeline.video.find((clip) => clip.id === sourceId) : undefined;
  const input = sourceClip?.kind === "main" ? props.project.inputs.find((item) => item.id === sourceClip.inputId) : undefined;
  const audioGain = props.timeline.audio;
  const separated = input ? audioGain.stems?.[input.id] : undefined;

  if (overlay) {
    const duration = overlayDuration(overlay);
    const updateOverlay = (changes: { startSec?: number; durationSec?: number; inEndSec?: number; x?: number; y?: number; width?: number }) => props.onChange({ ...props.timeline, overlays: updateOverlayInLayers(props.timeline.overlays, overlay.id, (item) => ({ ...item, ...changes } as OverlayClip)) });
    return <InspectorShell title={`${props.selectedTrack === "video" ? "영상 2" : props.selectedTrack?.replace(/^video-/, "영상 ") ?? "영상 2"} 속성`} error={error}>
      <label>시작 시각 <b>{overlay.startSec.toFixed(1)}초</b><input type="range" min="0" max={Math.max(0, videoDuration(props.timeline) - duration)} step="0.1" value={Math.min(overlay.startSec, Math.max(0, videoDuration(props.timeline) - duration))} onChange={(event) => updateOverlay({ startSec: Number(event.currentTarget.value) })} /></label>
      <label>길이 <b>{duration.toFixed(1)}초</b><input type="number" min="0.1" max={videoDuration(props.timeline) - overlay.startSec} step="0.1" value={duration} onChange={(event) => {
        const value = Number(event.currentTarget.value);
        if (!Number.isFinite(value) || value <= 0 || value > videoDuration(props.timeline) - overlay.startSec) return;
        updateOverlay("durationSec" in overlay ? { durationSec: value } : { inEndSec: overlay.inStartSec + value });
      }} /></label>
      <label>가로 위치 <b>{Math.round(overlay.x * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={overlay.x} onChange={(event) => updateOverlay({ x: Number(event.currentTarget.value) })} /></label>
      <label>세로 위치 <b>{Math.round(overlay.y * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={overlay.y} onChange={(event) => updateOverlay({ y: Number(event.currentTarget.value) })} /></label>
      <label>폭 <b>{Math.round(overlay.width * 100)}%</b><input type="range" min="0.1" max="1" step="0.01" value={overlay.width} onChange={(event) => updateOverlay({ width: Number(event.currentTarget.value) })} /></label>
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
      const target = sttTarget === "voice"
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
    const editTrim = (edge: "start" | "end", value: number) => {
      if (video.kind !== "main" || !("inStartSec" in video)) return;
      const updated = props.timeline.video.map((item) => item.id === video.id ? { ...video, [edge === "start" ? "inStartSec" : "inEndSec"]: value } : item);
      props.onChange({ ...props.timeline, video: updated });
    };
    return <InspectorShell title={video.kind === "meme" ? "짤 속성" : "영상 클립"} error={error} {...dialogProps}>
      {video.kind === "main" && "inStartSec" in video ? <div className="studio-inspector-grid">
        <label>원본 시작<input type="number" min="0" step="0.1" value={video.inStartSec} onChange={(event) => editTrim("start", Number(event.currentTarget.value))} /></label>
        <label>원본 끝<input type="number" min="0.1" max={selectedInput?.durationSec} step="0.1" value={video.inEndSec} onChange={(event) => editTrim("end", Number(event.currentTarget.value))} /></label>
      </div> : null}
      {video.kind === "meme" ? <>
        <label className="studio-range-label">길이 <b>{duration.toFixed(1)}초</b><input type="range" min="0.5" max="4" step="0.1" value={duration} onChange={(event) => props.onChange({ ...props.timeline, video: props.timeline.video.map((item) => item.id === video.id ? { ...video, durationSec: Number(event.currentTarget.value) } : item) })} /></label>
        <div className="studio-inspector-actions"><ActionButton variant="neutralWeak" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.max(0, props.timeline.video.findIndex((item) => item.id === video.id) - 1)))}>본 화면 앞</ActionButton><ActionButton variant="ghost" onClick={() => props.onChange(moveVideoClip(props.timeline, video.id, Math.min(props.timeline.video.length - 1, props.timeline.video.findIndex((item) => item.id === video.id) + 1)))}>본 화면 뒤</ActionButton></div>
        <p className="studio-help">왼쪽에서 다른 짤을 누르면 바꿔요.</p>
      </> : <CaptionEditor caption={props.timeline.captions.find((item) => item.startSec <= start + duration && item.endSec >= start)} timeline={props.timeline} onChange={props.onChange} />}
      <p className="studio-help">클립 위치 {start.toFixed(1)}초 · 길이 {duration.toFixed(1)}초</p>
    </InspectorShell>;
  }

  if (caption) return <InspectorShell title="자막 속성" error={error} {...dialogProps}><label>자막<textarea rows={4} value={caption.text} onChange={(event) => props.onChange({ ...props.timeline, captions: props.timeline.captions.map((item) => item.id === caption.id ? { ...caption, text: event.currentTarget.value } : item) })} /></label></InspectorShell>;
  if (voiceClip || sfxClip) {
    const clip = voiceClip ?? sfxClip!;
    const track = voiceClip ? "voice" : "sfx";
    return <InspectorShell title={track === "voice" ? "음성 속성" : "효과음 속성"} error={error} {...dialogProps}>
      <GainControl label="트랙 볼륨" gain={audioGain[track].gain} muted={audioGain[track].muted} onChange={(value) => updateGain(track, value)} onMute={() => toggleMute(track)} />
      <GainControl label="클립 볼륨" gain={clip.gain} onChange={(value) => updateClip(clip.id, { gain: value }, track)} />
      {track === "sfx" ? <label>효과음 바꾸기<select value={clip.file} onChange={(event) => { const item = sfxItems.find((sfx) => sfx.ref === event.currentTarget.value); if (item) updateClip(clip.id, { file: item.ref, inStartSec: 0, inEndSec: item.durationSec }, "sfx"); }}>{sfxItems.map((item) => <option key={item.id} value={item.ref}>{item.title}</option>)}</select></label> : null}
      {track === "voice" ? <label className="studio-radio"><input type="radio" name="sttTarget" checked={sttTarget === "voice"} onChange={() => setSttTarget("voice")} /> 음성 트랙에서 받아 적기</label> : null}
      {track === "voice" ? <ActionButton variant="neutralWeak" onClick={() => void createCaptions()}>자막 만들기</ActionButton> : null}
    </InspectorShell>;
  }

  if (sourceClip && input) return <InspectorShell title={separated ? "분리한 소리" : "원본 소리"} error={error} {...dialogProps}>
    {separated ? <>
      <GainControl label="목소리" gain={separated.voice.gain} muted={separated.voice.muted} onChange={(value) => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, voice: { ...separated.voice, gain: value } } } } })} onMute={() => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, voice: { ...separated.voice, muted: !separated.voice.muted } } } } })} />
      <GainControl label="배경" gain={separated.bg.gain} muted={separated.bg.muted} onChange={(value) => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, bg: { ...separated.bg, gain: value } } } } })} onMute={() => props.onChange({ ...props.timeline, audio: { ...audioGain, stems: { ...audioGain.stems, [input.id]: { ...separated, bg: { ...separated.bg, muted: !separated.bg.muted } } } } })} />
      <ActionButton variant="neutralWeak" onClick={() => void revertSeparate()}>분리 되돌리기</ActionButton>
      <fieldset className="studio-stt-options"><legend>받아 적을 트랙</legend><label><input type="radio" name="sttTrack" checked={sttTarget === "source"} onChange={() => setSttTarget("source")} /> 목소리 트랙</label><label><input type="radio" name="sttTrack" checked={sttTarget === "voice"} onChange={() => setSttTarget("voice")} /> 음성 트랙</label></fieldset>
      <ActionButton variant="neutralWeak" onClick={() => void createCaptions()}>자막 만들기</ActionButton>
    </> : <>
      <GainControl label="원본 소리 볼륨" gain={audioGain.source.gain} muted={audioGain.source.muted} onChange={(value) => updateGain("source", value)} onMute={() => toggleMute("source")} />
      <ActionButton variant="neutralWeak" onClick={() => void startSeparate()}>음성 분리</ActionButton>
      <fieldset className="studio-stt-options"><legend>받아 적을 트랙</legend><label><input type="radio" name="sttTrack" checked={sttTarget === "source"} onChange={() => setSttTarget("source")} /> 원본 소리</label><label><input type="radio" name="sttTrack" checked={sttTarget === "voice"} onChange={() => setSttTarget("voice")} /> 음성</label></fieldset>
      <ActionButton variant="ghost" onClick={() => void createCaptions()}>자막 만들기</ActionButton>
    </>}
    {job && ["queued", "running"].includes(job.status) ? <div className="studio-job"><ProgressCircle size="24" tone="brand" value={job.progress === null ? undefined : job.progress * 100} /><span>{job.message ?? "작업 중이에요."}</span><ActionButton variant="ghost" size="small" onClick={() => void cancelJob()}>취소</ActionButton></div> : null}
  </InspectorShell>;

  return <InspectorShell title="속성" {...dialogProps}><p className="studio-help">클립을 선택하면 속성을 편집할 수 있어요.</p></InspectorShell>;
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
      <AlertDialog.Backdrop /><AlertDialog.Positioner><AlertDialog.Content className="w11-alert-dialog">
        <AlertDialog.Header>
          <AlertDialog.Title>{critical ? "기존 자막을 바꿀까요?" : "whisper 모델을 받을까요?"}</AlertDialog.Title>
          <AlertDialog.Description>{critical ? "기존 자막을 새 자막으로 바꿔요." : "받아 적기 모델을 받으려면 574 MB가 필요해요."}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer className="w11-alert-dialog-footer">
          <ActionButton variant="neutralWeak" onClick={props.onCancel}>취소</ActionButton>
          <AlertDialog.Action asChild><ActionButton variant={critical ? "criticalSolid" : "neutralWeak"} onClick={props.onConfirm}>{critical ? "바꾸기" : "받기"}</ActionButton></AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content></AlertDialog.Positioner>
    </AlertDialog.Root>
  </>;
}

function GainControl(props: { label: string; gain: number; muted?: boolean; onChange: (value: number) => void; onMute?: () => void }) {
  return <label className="studio-range-label">{props.label} <b>{Math.round(props.gain * 100)}%</b><input type="range" min="0" max="1.5" step="0.01" value={props.gain} onChange={(event) => props.onChange(Number(event.currentTarget.value))} />{props.onMute ? <button type="button" onClick={props.onMute}>{props.muted ? "음소거 해제" : "음소거"}</button> : null}</label>;
}

function CaptionEditor(props: { caption?: TimelineData["captions"][number]; timeline: TimelineData; onChange: (timeline: TimelineData) => void }) {
  if (!props.caption) return null;
  return <label>자막<textarea rows={3} value={props.caption.text} onChange={(event) => props.onChange({ ...props.timeline, captions: props.timeline.captions.map((item) => item.id === props.caption!.id ? { ...props.caption!, text: event.currentTarget.value } : item) })} /></label>;
}
