import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Timeline as TimelineData, VideoClip } from "../../core/schema";
import { videoDuration, videoStartTimes, VIDEO_TRACK_REQUIRED_MESSAGE } from "../../core/timeline/ops";
import { createHistory, pushHistory, redo, undo, type TimelineHistory } from "../../core/timeline/history";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { Preview } from "../studio/Preview";
import { Timeline } from "../studio/Timeline";
import { Inspector } from "../studio/Inspector";
import { LibraryPanel, type LibraryDragItem } from "../studio/LibraryPanel";
import { api } from "../api";
import { ExportDialog } from "../ExportDialog";
import { ArrowLeft01Icon, PlayIcon, PauseIcon, Undo02Icon, Redo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { replaceMemeClip } from "../studio/replace-meme-clip";
import { scaleWidthForZoom } from "../studio/timeline-zoom";
import { decideOverlayDrop } from "../studio/overlay-drop";
import { VIDEO_TRACK_EDIT_GRID_SELECTOR } from "../studio/video-track-drop";
import { timelineToStudioRows } from "../studio/timeline-adapter";
import { TRACK_ROW_HEIGHT } from "../studio/timeline-layout";
import { findOverlayInLayers, placeOverlayAtLayer, placeOverlayInLowestLayer, updateOverlayInLayers } from "../../core/timeline/overlay-layers";
import { canGroupVideoClips, groupVideoClips, selectVideoRange, ungroupVideoClips, type VideoClipRef } from "../../core/timeline/video-groups";
import { timelineToRender } from "../../core/timeline/to-render";
import { clampTimeToLastFrame } from "../studio/preview-seek";
import { studioShortcut } from "../studio/shortcuts";
import { deleteStudioSelection } from "../studio/delete-selection";
import { decideNewLaneDrop } from "../studio/library-drop";
import { audioGroupForRow, nextSfxLane, sfxLane, sfxRowId } from "../../core/timeline/sfx-lanes";
import { resolveLibraryDropPosition, resolvePointerDropTarget } from "../studio/library-drop";

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
  const [libraryDropGuide, setLibraryDropGuide] = useState<{ x: number; top: number; height: number } | null>(null);
  const timeline = history.present;
  const duration = useMemo(() => Math.max(0.1, videoDuration(timeline)), [timeline]);
  const render = useMemo(() => timelineToRender(timeline), [timeline]);
  const starts = useMemo(() => videoStartTimes(timeline), [timeline]);

  useEffect(() => {
    setPlayhead((current) => clampTimeToLastFrame(current, render.durationInFrames, render.fps));
  }, [render.durationInFrames, render.fps]);

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
      const shortcut = studioShortcut({
        key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey,
        altKey: event.altKey, shiftKey: event.shiftKey, isComposing: event.isComposing,
        keyCode: event.keyCode, targetTagName: (event.target as HTMLElement | null)?.tagName,
        targetType: (event.target as HTMLInputElement | null)?.type,
        targetIsContentEditable: (event.target as HTMLElement | null)?.isContentEditable,
      });
      if (shortcut === "undo" || shortcut === "redo") {
        event.preventDefault(); moveHistory(shortcut); return;
      }
      if (shortcut === "toggle-play") {
        event.preventDefault();
        if (!event.repeat && !recording) setPlaying((value) => !value);
        return;
      }
      if (shortcut === "group" || shortcut === "ungroup") {
        if (shortcut === "ungroup") {
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
      if (shortcut === "delete" && selectedIds.length && selected.track) {
        let next = timeline;
        for (const id of selectedIds) {
          const result = deleteStudioSelection(next, selected.track, id);
          if (result.blocked) { props.onSnackbar(VIDEO_TRACK_REQUIRED_MESSAGE); event.preventDefault(); return; }
          next = result.timeline;
        }
        edit(next); setSelected({ id: null, track: null }); setSelectedIds([]);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveHistory, timeline, selected, selectedIds, edit, props.onSnackbar, recording]);

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
    const selectedOverlay = selected.id ? findOverlayInLayers(timeline.overlays, selected.id) : undefined;
    if (selectedOverlay && "memeId" in selectedOverlay.clip) {
      edit({ ...timeline, overlays: updateOverlayInLayers(timeline.overlays, selectedOverlay.clip.id, (clip) => "memeId" in clip ? { ...clip, memeId: meme.id } : clip) });
      return;
    }
    addOverlay({ type: "meme", meme }, playhead);
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

  function addSfx(item: SfxItem, startSec = playhead, lane = 0) {
    const clip = { id: crypto.randomUUID(), startSec, file: item.ref, inStartSec: 0, inEndSec: item.durationSec, gain: 1, lane };
    edit({ ...timeline, sfx: [...timeline.sfx, clip] });
    setSelected({ id: clip.id, track: sfxRowId(lane, [...timeline.sfx.map(sfxLane), lane]) }); setSelectedIds([clip.id]);
  }

  async function addLibraryItemAt(item: LibraryDragItem, clientX: number, clientY: number) {
    try {
      const editor = document.querySelector<HTMLElement>(".studio-timeline-editor");
      const grid = editor?.querySelector<HTMLElement>(VIDEO_TRACK_EDIT_GRID_SELECTOR);
      const preview = document.querySelector<HTMLElement>(".studio-preview-area");
      const gridRect = grid?.getBoundingClientRect();
      const previewRect = preview?.getBoundingClientRect();
      const target = resolvePointerDropTarget({
        clientX, clientY,
        previewRect: previewRect ? { left: previewRect.left, top: previewRect.top, right: previewRect.right, bottom: previewRect.bottom } : null,
        timelineRect: gridRect ? { left: gridRect.left, top: gridRect.top, right: gridRect.right, bottom: gridRect.bottom } : null,
        gridLeft: gridRect?.left ?? 0, scrollLeft: grid?.scrollLeft ?? 0, scaleWidth: scaleWidthForZoom(zoom), playhead,
      });
      if (target.kind === "none") return;
      const rows = timelineToStudioRows(timeline);
      const position = target.kind === "timeline" && gridRect ? resolveLibraryDropPosition({ pointerX: clientX, pointerY: clientY, gridLeft: gridRect.left, gridTop: gridRect.top, scrollLeft: grid!.scrollLeft, scrollTop: grid!.scrollTop, scaleWidth: scaleWidthForZoom(zoom), rows: ["captions", "video-new", ...rows.filter((row) => /^video-(?:[2-9]|[1-9]\d+)$/.test(row.id)).map((row) => row.id), "video", ...rows.filter((row) => !/^(?:captions|video|video-(?:[2-9]|[1-9]\d+))$/.test(row.id)).map((row) => row.id)] }) : null;
      const atSec = target.atSec;
      if (item.type === "meme") {
        const decision = decideNewLaneDrop({ kind: "meme", atSec, videoDurationSec: videoDuration(timeline), mediaDurationSec: item.meme.durationSec ?? 2, trackCount: timeline.overlays.length });
        if (decision) addOverlay({ type: "meme", meme: { ...item.meme, durationSec: decision.durationSec } }, decision.startSec, decision.track);
        return;
      }
      if (item.type === "sfx") {
        const decision = decideNewLaneDrop({ kind: "sfx", atSec, videoDurationSec: videoDuration(timeline), mediaDurationSec: item.sfx.durationSec, trackCount: nextSfxLane(timeline.sfx) });
        if (decision) addSfx(item.sfx, decision.startSec, decision.track);
        return;
      }
      if (target.kind !== "timeline") return;
      const targetTrack = position?.track ?? "other";
      const startsAt = videoStartTimes(timeline);
      const hitsVideoClip = timeline.video.some((clip) => atSec >= startsAt[clip.id]! && atSec < startsAt[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec));
      const decision = decideOverlayDrop({ source: { kind: props.project.inputs.find((input) => input.id === item.id)?.kind ?? "video", id: item.id }, targetTrack: targetTrack === "video" ? "video" : /^video-(?:[2-9]|[1-9]\d+)$/.test(targetTrack) ? "overlay" : "other", hitsVideoClip, atSec, videoDurationSec: videoDuration(timeline) });
      if (decision.kind === "overlay") addOverlay({ type: "input", id: item.id }, decision.startSec, /^video-(?:[2-9]|[1-9]\d+)$/.test(targetTrack) ? Number(targetTrack.slice(6)) - 2 : undefined);
      else if (decision.kind === "append-video") addVideo(item.id, decision.startSec);
    } catch { props.onError("클립을 추가하지 못했어요."); }
  }

  function updateLibraryDropGuide(clientX: number, clientY: number) {
    const grid = document.querySelector<HTMLElement>(`.studio-timeline-editor ${VIDEO_TRACK_EDIT_GRID_SELECTOR}`);
    const rect = grid?.getBoundingClientRect();
    const target = resolvePointerDropTarget({
      clientX, clientY, previewRect: null,
      timelineRect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
      gridLeft: rect?.left ?? 0, scrollLeft: grid?.scrollLeft ?? 0, scaleWidth: scaleWidthForZoom(zoom), playhead,
    });
    if (target.kind !== "timeline" || !rect) { setLibraryDropGuide(null); return; }
    setLibraryDropGuide({ x: rect.left + target.atSec * scaleWidthForZoom(zoom) - grid!.scrollLeft, top: rect.top, height: rect.height });
  }

  function toggleMute(track: string) {
    const group = audioGroupForRow(track);
    if (group === "source" || group === "voice" || group === "sfx") {
      edit({ ...timeline, audio: { ...timeline.audio, [group]: { ...timeline.audio[group], muted: !timeline.audio[group].muted } } });
      return;
    }
    if (group === "stem-voice" || group === "stem-bg") {
      const stem = group === "stem-voice" ? "voice" : "bg";
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
      <LibraryPanel project={{ ...props.project, timeline }} selectedId={selected.id} playhead={playhead} onAddVoice={addVoice} onRecordingChange={(active) => { setRecording(active); if (active) setPlaying(false); }} onAddVideo={(id) => addVideo(id)} onSelectMeme={(meme) => addMeme(meme, timeline.video.find((clip) => clip.id === selected.id && clip.kind === "meme")?.id)} onAddSfx={addSfx} onPointerDrop={(item, x, y) => void addLibraryItemAt(item, x, y)} onPointerMove={updateLibraryDropGuide} onPointerCancel={() => setLibraryDropGuide(null)} onProject={props.onProject} onError={props.onError} onSnackbar={props.onSnackbar} />
      <section className="studio-preview-area" aria-label="미리보기">
        <Preview project={{ ...props.project, timeline }} time={playhead} playing={playing} muteOriginal={recording} onTime={setPlayhead} onPlaying={setPlaying} />
        <div className="studio-playback-controls">
          <button type="button" aria-label={playing ? "일시 정지" : "재생"} disabled={recording} onClick={() => setPlaying((value) => !value)}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={18} /></button>
          <span>{timeLabel(playhead)} / {timeLabel(duration)}</span>
          <input aria-label="재생 헤드" type="range" min="0" max={duration} step="0.01" value={Math.min(playhead, duration)} onChange={(event) => setPlayhead(Number(event.currentTarget.value))} />
        </div>
      </section>
      <Inspector project={{ ...props.project, timeline }} selectedId={selected.id} selectedIds={selectedIds} selectedTrack={selected.track} timeline={timeline} onChange={edit} onProject={props.onProject} onSnackbar={props.onSnackbar} onUngroup={() => edit(ungroupVideoClips(timeline, selectedIds))} />
    </div>
    <div className="studio-edit-toolbar">
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
    <div className="studio-timeline-drop">
      {libraryDropGuide ? <div className="studio-library-drop-guide" style={{ left: libraryDropGuide.x, top: libraryDropGuide.top, height: libraryDropGuide.height }} /> : null}
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
