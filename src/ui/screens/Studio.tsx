import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Timeline as TimelineData, VideoClip } from "../../core/schema";
import { deleteVideoSelection, videoDuration, videoStartTimes, VIDEO_TRACK_REQUIRED_MESSAGE } from "../../core/timeline/ops";
import { createHistory, pushHistory, redo, undo, type TimelineHistory } from "../../core/timeline/history";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { Preview } from "../studio/Preview";
import { Timeline } from "../studio/Timeline";
import { Inspector } from "../studio/Inspector";
import { LibraryPanel } from "../studio/LibraryPanel";
import { api } from "../api";
import { ExportDialog } from "../ExportDialog";
import { ArrowLeft01Icon, PlayIcon, PauseIcon, Undo02Icon, Redo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { replaceMemeClip } from "../studio/replace-meme-clip";
import { pixelsToSeconds, scaleWidthForZoom } from "../studio/timeline-zoom";
import { decideOverlayDrop } from "../studio/overlay-drop";
import { timelineToStudioRows } from "../studio/timeline-adapter";
import { TIMELINE_RULER_HEIGHT, TRACK_ROW_HEIGHT } from "../studio/timeline-layout";
import { findOverlayInLayers, placeOverlayAtLayer, placeOverlayInLowestLayer } from "../../core/timeline/overlay-layers";
import { canGroupVideoClips, groupVideoClips, selectVideoRange, ungroupVideoClips, type VideoClipRef } from "../../core/timeline/video-groups";

interface MemeItem { id: string; emotion: string; situations: string[]; description?: string; durationSec?: number; url: string }
interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }

export function Studio(props: {
  project: Project;
  onProject: (project: Project) => void;
  onBack: () => void;
  onSnackbar: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [history, setHistory] = useState<TimelineHistory>(() => createHistory(props.project.timeline));
  const [playhead, setPlayhead] = useState(0);
  const [selected, setSelected] = useState<{ id: string | null; track: string | null }>({ id: null, track: null });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(4);
  const [snap, setSnap] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const timeline = history.present;
  const duration = useMemo(() => Math.max(0.1, videoDuration(timeline)), [timeline]);
  const starts = useMemo(() => videoStartTimes(timeline), [timeline]);

  useEffect(() => {
    setHistory(createHistory(props.project.timeline));
    setSelected({ id: null, track: null });
    setSelectedIds([]);
  }, [props.project.id]);

  const edit = useCallback((next: TimelineData) => {
    if (JSON.stringify(next) === JSON.stringify(history.present)) return;
    setHistory((current) => pushHistory(current, next));
  }, [history.present]);

  const addVoice = useCallback((file: string, durationSec: number) => {
    const clip = { id: crypto.randomUUID(), startSec: playhead, file, inStartSec: 0, inEndSec: durationSec, gain: 1 };
    edit({ ...history.present, voice: [...history.present.voice, clip] });
  }, [edit, history.present, playhead]);

  const moveHistory = useCallback((direction: "undo" | "redo") => {
    setHistory((current) => direction === "undo" ? undo(current) : redo(current));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isTextInput(event.target)) {
        event.preventDefault();
        moveHistory(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTextInput(event.target)) return;
      if (event.key.toLowerCase() === "m") {
        if (event.shiftKey) {
          const selectedClip = findVideoClip(timeline, selected.id);
          const groupId = selectedClip?.groupId;
          if (!groupId) { props.onSnackbar("묶음 클립을 선택하세요."); return; }
          edit(ungroupVideoClips(timeline, selectedIds));
        } else {
          const refs: VideoClipRef[] = selectedIds.map((id) => ({ id, track: videoTrackForId(timeline, id) ?? selected.track ?? "" }));
          const canGroup = canGroupVideoClips(timeline, refs);
          if (!canGroup.ok) { props.onSnackbar(canGroup.reason ?? "클립을 묶을 수 없습니다."); return; }
          edit(groupVideoClips(timeline, refs, crypto.randomUUID()));
        }
        event.preventDefault();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length && selected.track?.startsWith("video")) {
        const result = deleteVideoSelection(timeline, selectedIds);
        if (result.blocked) props.onSnackbar(VIDEO_TRACK_REQUIRED_MESSAGE);
        else {
          edit(result.timeline);
          setSelected({ id: null, track: null });
          setSelectedIds([]);
        }
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveHistory, timeline, selected, selectedIds, edit, props.onSnackbar]);

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}`, { ...props.project, timeline, savedAt: new Date().toISOString() });
      props.onProject(saved);
      props.onSnackbar("저장했어요.");
      return true;
    } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); return false; }
    finally { setSaving(false); }
  }

  function addVideo(inputId: string, at = videoDuration(timeline)) {
    const input = props.project.inputs.find((item) => item.id === inputId);
    if (!input) return;
    const clip: VideoClip = input.kind === "video"
      ? { id: crypto.randomUUID(), kind: "main", inputId, inStartSec: 0, inEndSec: input.durationSec ?? 1 }
      : { id: crypto.randomUUID(), kind: "main", inputId, durationSec: 1.5 };
    const list = [...timeline.video];
    const insertion = Math.max(0, Math.min(list.length, list.findIndex((item) => starts[item.id]! >= at)));
    if (insertion === 0 && at >= duration) list.push(clip);
    else list.splice(insertion < 0 ? list.length : insertion, 0, clip);
    edit({ ...timeline, video: list });
    setSelected({ id: clip.id, track: "video" }); setSelectedIds([clip.id]);
  }

  function addMeme(meme: MemeItem, replaceId?: string) {
    if (replaceId) {
      edit(replaceMemeClip(timeline, replaceId, meme.id));
      return;
    }
    const durationSec = Math.max(0.5, Math.min(4, Math.min(meme.durationSec ?? 2, 2)));
    const clip: VideoClip = { id: crypto.randomUUID(), kind: "meme", memeId: meme.id, durationSec };
    const insertAfter = selected.track === "video" ? timeline.video.findIndex((item) => item.id === selected.id) : -1;
    const video = [...timeline.video];
    video.splice(insertAfter >= 0 ? insertAfter + 1 : video.length, 0, clip);
    edit({ ...timeline, video });
    setSelected({ id: clip.id, track: "video" }); setSelectedIds([clip.id]);
  }

  function addOverlay(source: { type: "meme"; meme: MemeItem } | { type: "input"; id: string }, startSec: number, targetLayer?: number) {
    const total = videoDuration(timeline);
    const remaining = total - startSec;
    if (remaining <= 0) return;
    const common = { id: crypto.randomUUID(), startSec, x: 0.5, y: 0.5, width: 0.6 };
    if (source.type === "meme") {
      const durationSec = Math.min(source.meme.durationSec ?? 2, remaining);
      const overlay = { ...common, memeId: source.meme.id, durationSec };
      const overlays = targetLayer === undefined ? placeOverlayInLowestLayer(timeline.overlays, overlay) : placeOverlayAtLayer(timeline.overlays, overlay, targetLayer);
      edit({ ...timeline, overlays });
      setSelected({ id: common.id, track: `video-${findOverlayInLayers(overlays, common.id)!.layer + 2}` }); setSelectedIds([common.id]);
      return;
    }
    const input = props.project.inputs.find((item) => item.id === source.id);
    if (!input) return;
    const overlay = input.kind === "video"
      ? { ...common, kind: "video" as const, inputId: input.id, inStartSec: 0, inEndSec: Math.min(input.durationSec ?? remaining, remaining) }
      : { ...common, kind: "photo" as const, inputId: input.id, durationSec: Math.min(3, remaining) };
    const overlays = targetLayer === undefined ? placeOverlayInLowestLayer(timeline.overlays, overlay) : placeOverlayAtLayer(timeline.overlays, overlay, targetLayer);
    edit({ ...timeline, overlays });
    setSelected({ id: common.id, track: `video-${findOverlayInLayers(overlays, common.id)!.layer + 2}` }); setSelectedIds([common.id]);
  }

  function addSfx(item: SfxItem) {
    const clip = { id: crypto.randomUUID(), startSec: playhead, file: item.ref, inStartSec: 0, inEndSec: item.durationSec, gain: 1 };
    edit({ ...timeline, sfx: [...timeline.sfx, clip] });
    setSelected({ id: clip.id, track: "sfx" }); setSelectedIds([clip.id]);
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/u3-studio-item");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { type: string; id: string };
      if (data.type === "video" || data.type === "meme") {
        const grid = document.querySelector<HTMLElement>(".studio-timeline-editor .ReactVirtualized__Grid");
        const time = grid ? Math.max(0, pixelsToSeconds(event.clientX - grid.getBoundingClientRect().left + grid.scrollLeft - 20, scaleWidthForZoom(zoom))) : videoDuration(timeline);
        const host = document.querySelector<HTMLElement>(".studio-timeline-editor");
        const rows = timelineToStudioRows(timeline);
        const rowIndex = host ? Math.floor((event.clientY - host.getBoundingClientRect().top - TIMELINE_RULER_HEIGHT) / TRACK_ROW_HEIGHT) : -1;
        const targetTrack = rowIndex >= 0 ? rows[rowIndex]?.id ?? "other" : "other";
        const startsAt = videoStartTimes(timeline);
        const hitsVideoClip = timeline.video.some((clip) => time >= startsAt[clip.id]! && time < startsAt[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec));
        const decision = decideOverlayDrop({ source: { kind: data.type === "meme" ? "meme" : props.project.inputs.find((input) => input.id === data.id)?.kind ?? "video", id: data.id }, targetTrack: targetTrack === "video" ? "video" : /^video-[2-9]\d*$/.test(targetTrack) ? "overlay" : "other", hitsVideoClip, atSec: time, videoDurationSec: videoDuration(timeline) });
        if (decision.kind === "overlay") {
          if (data.type === "meme") {
            const items = await api<MemeItem[]>("GET", "/api/library/memes");
            const item = items.find((meme) => meme.id === data.id);
            if (item) addOverlay({ type: "meme", meme: item }, decision.startSec, /^video-[2-9]\d*$/.test(targetTrack) ? Number(targetTrack.slice(6)) - 2 : undefined);
          } else addOverlay({ type: "input", id: data.id }, decision.startSec, /^video-[2-9]\d*$/.test(targetTrack) ? Number(targetTrack.slice(6)) - 2 : undefined);
        } else if (decision.kind === "append-video" && data.type === "video") addVideo(data.id, decision.startSec);
        else if (data.type === "meme") {
          const items = await api<MemeItem[]>("GET", "/api/library/memes");
          const item = items.find((meme) => meme.id === data.id);
          if (item) addMeme(item);
        }
      }
      if (data.type === "sfx") {
        const items = await api<SfxItem[]>("GET", "/api/library/sfx");
        const item = items.find((sfx) => sfx.id === data.id);
        if (item) addSfx(item);
      }
    } catch { props.onError("클립을 추가하지 못했어요."); }
  }

  function toggleMute(track: string) {
    if (track === "source" || track === "voice" || track === "sfx") {
      edit({ ...timeline, audio: { ...timeline.audio, [track]: { ...timeline.audio[track], muted: !timeline.audio[track].muted } } });
      return;
    }
    if (track === "stem-voice" || track === "stem-bg") {
      const stem = track === "stem-voice" ? "voice" : "bg";
      const stems = { ...timeline.audio.stems };
      for (const [inputId, gains] of Object.entries(stems)) stems[inputId] = { ...gains, [stem]: { ...gains[stem], muted: !gains[stem].muted } };
      edit({ ...timeline, audio: { ...timeline.audio, stems } });
    }
  }

  return <section className="studio-screen" aria-label="스튜디오">
    <header className="studio-header">
      <ActionButton className="studio-back-button" variant="ghost" aria-label="대본으로 돌아가기" onClick={props.onBack}><HugeiconsIcon icon={ArrowLeft01Icon} size={18} /></ActionButton>
      <strong className="studio-project-name">{props.project.name}</strong>
      <ActionButton variant="neutralWeak" loading={saving} onClick={() => void save()}>저장</ActionButton>
      <ActionButton variant="brandSolid" onClick={() => void save().then(saved => { if (saved) setExportOpen(true); })}>mp4 내보내기</ActionButton>
    </header>
    <div className="studio-workspace">
      <LibraryPanel project={{ ...props.project, timeline }} selectedId={selected.id} playhead={playhead} onAddVoice={addVoice} onRecordingChange={(active) => { setRecording(active); if (active) setPlaying(false); }} onAddVideo={(id) => addVideo(id)} onSelectMeme={(meme) => addMeme(meme, timeline.video.find((clip) => clip.id === selected.id && clip.kind === "meme")?.id)} onAddSfx={addSfx} onProject={props.onProject} onError={props.onError} onSnackbar={props.onSnackbar} />
      <section className="studio-preview-area" aria-label="미리보기">
        <Preview project={{ ...props.project, timeline }} time={playhead} playing={playing} muteOriginal={recording} onTime={setPlayhead} onPlaying={setPlaying} />
        <div className="studio-playback-controls">
          <button type="button" aria-label={playing ? "일시 정지" : "재생"} onClick={() => setPlaying((value) => !value)}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={18} /></button>
          <span>{timeLabel(playhead)} / {timeLabel(duration)}</span>
          <input aria-label="재생 헤드" type="range" min="0" max={duration} step="0.01" value={Math.min(playhead, duration)} onChange={(event) => setPlayhead(Number(event.currentTarget.value))} />
        </div>
      </section>
      <Inspector project={{ ...props.project, timeline }} selectedId={selected.id} selectedIds={selectedIds} selectedTrack={selected.track} timeline={timeline} onChange={edit} onProject={props.onProject} onSnackbar={props.onSnackbar} onUngroup={() => edit(ungroupVideoClips(timeline, selectedIds))} />
    </div>
    <div className="studio-edit-toolbar">
      <button type="button" aria-label="재생" onClick={() => setPlaying(true)}><HugeiconsIcon icon={PlayIcon} size={16} /></button>
      <span>{timeLabel(playhead)}</span>
      <ActionButton
        className="studio-history-button"
        variant="neutralOutline"
        size="small"
        title="실행 취소 ⌘Z"
        disabled={!history.past.length}
        onClick={() => moveHistory("undo")}
      >
        <HugeiconsIcon icon={Undo02Icon} size={16} />실행 취소
      </ActionButton>
      <ActionButton
        className="studio-history-button"
        variant="neutralOutline"
        size="small"
        title="다시 실행 ⇧⌘Z"
        disabled={!history.future.length}
        onClick={() => moveHistory("redo")}
      >
        <HugeiconsIcon icon={Redo02Icon} size={16} />다시 실행
      </ActionButton>
      <span className="studio-toolbar-spacer" />
      <span>스냅</span><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.currentTarget.checked)} />
      <label>확대 <input type="range" min="1" max="10" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} /><output>{zoom.toFixed(1)}×</output></label>
    </div>
    <div className="studio-timeline-drop" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <Timeline timeline={timeline} inputs={props.project.inputs} playhead={playhead} zoom={zoom} snap={snap} selectedId={selected.id} selectedIds={selectedIds} onSelect={(id, track, shift) => {
        if (!id) { setSelected({ id: null, track: null }); setSelectedIds([]); return; }
        const ids = shift && selected.id
          ? selected.track === track
            ? selectVideoRange(timeline, track ?? "", selected.id, id).map((item) => item.id)
            : [...selectedIds, id]
          : [id];
        const expanded = expandVideoGroupSelection(timeline, ids);
        setSelected({ id, track }); setSelectedIds(expanded);
      }} onPlayhead={setPlayhead} onEdit={edit} onError={props.onError} onBlocked={props.onSnackbar} onSnapChange={setSnap} onZoomChange={setZoom} onMute={toggleMute} inputDurations={Object.fromEntries(props.project.inputs.map((input) => [input.id, input.durationSec ?? 1]))} />
    </div>
    {exportOpen ? <ExportDialog projectId={props.project.id} projectName={props.project.name} timelineLength={Math.max(duration, ...timeline.voice.map(clip => clip.startSec + clip.inEndSec - clip.inStartSec), ...timeline.sfx.map(clip => clip.startSec + clip.inEndSec - clip.inStartSec))} onClose={() => setExportOpen(false)} onSnackbar={props.onSnackbar} /> : null}
  </section>;
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function findVideoClip(timeline: TimelineData, id: string | null) {
  if (!id) return undefined;
  return timeline.video.find((clip) => clip.id === id) ?? timeline.overlays.flat().find((clip) => clip.id === id);
}

function videoTrackForId(timeline: TimelineData, id: string): string | undefined {
  if (timeline.video.some((clip) => clip.id === id)) return "video";
  const layer = timeline.overlays.findIndex((items) => items.some((clip) => clip.id === id));
  return layer < 0 ? undefined : `video-${layer + 2}`;
}

function expandVideoGroupSelection(timeline: TimelineData, selectedIds: readonly string[]): string[] {
  const groupIds = new Set(selectedIds.flatMap((id) => {
    const clip = findVideoClip(timeline, id);
    return clip?.groupId ? [clip.groupId] : [];
  }));
  if (!groupIds.size) return [...selectedIds];
  return [...new Set([
    ...selectedIds,
    ...timeline.video.filter((clip) => clip.groupId && groupIds.has(clip.groupId)).map((clip) => clip.id),
    ...timeline.overlays.flat().filter((clip) => clip.groupId && groupIds.has(clip.groupId)).map((clip) => clip.id),
  ])];
}

function timeLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}
