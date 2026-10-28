import { Timeline as TimelineEditor, type TimelineState } from "@xzdarcy/react-timeline-editor";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Input, Timeline as TimelineData } from "../../core/schema";
import { VolumeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { moveAudioClip, moveCaptionClip, moveOverlayClip, overlayDuration, splitOverlayClip, splitVideoClip, trimAudioClip, trimCaptionClip, trimOverlayClip, trimVideoClip, videoStartTimes } from "../../core/timeline/ops";
import { labelForAction, timelineToStudioRows, reorderVideoByStart, type StudioAction, type MemeLabel, type SfxLabel } from "./timeline-adapter";
import { api, type EngineJob } from "../api";
import { ttsOverflow } from "../../core/tts-clips";
import { Button } from "../components/ui/button";
import { scaleWidthForZoom, scrollLeftForZoomAnchor, zoomFromPinch, zoomFromWheel } from "./timeline-zoom";
import { TIMELINE_ACTION_INSET, TIMELINE_RULER_HEIGHT, TRACK_ROW_HEIGHT, timelineActionHeight, timelineEditorHeight, timelineTrackHeaderLayout } from "./timeline-layout";
import { findOverlayInLayers } from "../../core/timeline/overlay-layers";
import { moveOverlayClipToLayer, moveOverlayClipToVideo1, moveVideo1ClipToOverlay } from "../../core/timeline/video-track-edits";
import { findVideoClipAtTime } from "../../core/timeline/video-pointer";
import { moveVideoGroup } from "../../core/timeline/video-groups";
import { decideActionMove, isUnchangedTimeline, resolveVideoTrackAtPointer, shouldResetNewTrackDrop, VIDEO_TRACK_EDIT_GRID_SELECTOR } from "./video-track-drop";
import { timelinePointerSeconds } from "./timeline-zoom";
import { studioShortcut } from "./shortcuts";
import { audioGroupForRow, normalizeSfxLanes } from "../../core/timeline/sfx-lanes";
import { timelineTrackLabels, withNewVideoTrackRow } from "./timeline-track-labels";
import { TrackHeader } from "../components/u3/TrackHeader";
import { Progress } from "../components/ui/progress";
import { Input as TextInput } from "../components/ui/input";
import { updateCaption } from "./CaptionStyleEditor";
import { captionLayersOf } from "../../core/schema";

function blurTimelineControlFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches("button, [role=button], [role=tab]")) active.blur();
}

export function Timeline(props: {
  timeline: TimelineData;
  inputs?: readonly Input[];
  playhead: number;
  zoom: number;
  snap: boolean;
  inputDurations?: Record<string, number>;
  audioDurations?: Record<string, number>;
  selectedId: string | null;
  selectedIds: readonly string[];
  onSelect: (id: string | null, track: string | null, shift?: boolean) => void;
  onPlayhead: (time: number) => void;
  onEdit: (timeline: TimelineData) => void;
  onError: (message: string) => void;
  onZoomChange?: (zoom: number) => void;
  onMute?: (track: string) => void;
  onBlocked?: (message: string) => void;
  onGenerateTts?: () => void;
  onCancelTts?: () => void;
  ttsBusy?: boolean;
  ttsJob?: EngineJob | null;
}) {
  const ref = useRef<TimelineState>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(props.zoom);
  const gestureZoom = useRef(props.zoom);
  const dragTarget = useRef<{ id: string; rowId: string; clientY: number } | null>(null);
  const pointerPosition = useRef<{ x: number; y: number } | null>(null);
  const [sfxItems, setSfxItems] = useState<SfxLabel[]>([]);
  const [memeItems, setMemeItems] = useState<MemeLabel[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const rows = useMemo(() => timelineToStudioRows(props.timeline), [props.timeline]);
  const displayRows = useMemo(() => withNewVideoTrackRow(rows), [rows]);
  const tracks = timelineTrackLabels(displayRows);
  const ttsWarnings = new Set(ttsOverflow(props.timeline).map(clip => clip.id));
  const starts = useMemo(() => videoStartTimes(props.timeline), [props.timeline]);
  const data = displayRows.map((item) => ({ ...item, actions: item.actions.map((action) => ({ ...action, selected: props.selectedIds.includes(action.id) })) }));

  useEffect(() => {
    let active = true;
    void api<SfxLabel[]>("GET", "/api/library/sfx").then(items => { if (active) setSfxItems(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const ids = [...new Set(props.timeline.overlays.flat().filter((clip) => "memeId" in clip).map((clip) => "memeId" in clip ? clip.memeId : ""))];
    void Promise.all(ids.map(async (id) => {
      const items = await api<MemeLabel[]>("GET", `/api/library/memes?q=${encodeURIComponent(id)}`).catch(() => []);
      return items.find((item) => item.id === id);
    })).then((items) => { if (active) setMemeItems(items.filter((item): item is MemeLabel => Boolean(item))); });
    return () => { active = false; };
  }, [props.timeline.overlays]);

  useEffect(() => {
    ref.current?.setTime(props.playhead);
  }, [props.playhead]);

  useEffect(() => { zoomRef.current = props.zoom; }, [props.zoom]);

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      pointerPosition.current = { x: event.clientX, y: event.clientY };
      if (dragTarget.current) dragTarget.current.clientY = event.clientY;
    };
    window.addEventListener("pointermove", trackPointer);
    return () => window.removeEventListener("pointermove", trackPointer);
  }, []);

  useEffect(() => {
    const finishDrag = () => { requestAnimationFrame(() => { dragTarget.current = null; }); };
    const cancelDrag = () => { dragTarget.current = null; };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancelDrag(); };
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("mouseup", finishDrag, true);
    window.addEventListener("blur", finishDrag);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerup", finishDrag, true);
      window.removeEventListener("mouseup", finishDrag, true);
      window.removeEventListener("blur", finishDrag);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const host = editorHost.current;
    if (!host) return;
    const applyZoom = (nextZoom: number, clientX: number) => {
      const previousZoom = zoomRef.current;
      if (nextZoom === previousZoom) return;
      const grid = host.querySelector<HTMLElement>(".ReactVirtualized__Grid");
      const gridRect = grid?.getBoundingClientRect();
      if (!grid || !gridRect) return;
      const pointerX = clientX - gridRect.left - 20;
      const scrollLeft = grid.scrollLeft;
      const nextScroll = scrollLeftForZoomAnchor(
        scrollLeft,
        pointerX,
        scaleWidthForZoom(previousZoom),
        scaleWidthForZoom(nextZoom),
      );
      zoomRef.current = nextZoom;
      props.onZoomChange?.(nextZoom);
      requestAnimationFrame(() => ref.current?.setScrollLeft(nextScroll));
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 100 : 1);
      applyZoom(zoomFromWheel(zoomRef.current, delta), event.clientX);
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      gestureZoom.current = zoomRef.current;
    };
    const onGestureChange = (event: Event) => {
      const gesture = event as Event & { scale: number; clientX: number };
      event.preventDefault();
      event.stopPropagation();
      applyZoom(zoomFromPinch(gestureZoom.current, gesture.scale), gesture.clientX);
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("gesturestart", onGestureStart, { passive: false });
    host.addEventListener("gesturechange", onGestureChange, { passive: false });
    host.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("gesturestart", onGestureStart);
      host.removeEventListener("gesturechange", onGestureChange);
      host.removeEventListener("gestureend", onGestureEnd);
    };
  }, [props.onZoomChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const shortcut = studioShortcut({ key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, isComposing: event.isComposing, keyCode: event.keyCode, targetTagName: target?.tagName, targetType: (target as HTMLInputElement | null)?.type, targetRole: target?.closest("[role]")?.getAttribute("role") ?? undefined, targetIsContentEditable: (target as HTMLElement | null)?.isContentEditable });
      if (shortcut !== "split-pointer" && shortcut !== "split-playhead") return;
      let targetId: string | undefined;
      let atSec: number | undefined;
      if (shortcut === "split-pointer") {
        const pointer = pointerPosition.current;
        const grid = editorHost.current?.querySelector<HTMLElement>(VIDEO_TRACK_EDIT_GRID_SELECTOR);
        const rect = grid?.getBoundingClientRect();
        if (!pointer || !grid || !rect || pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) return;
        const rowIndex = Math.floor((pointer.y - rect.top + grid.scrollTop) / TRACK_ROW_HEIGHT);
        const rowId = displayRows[rowIndex]?.id;
        atSec = timelinePointerSeconds(pointer.x, rect.left, grid.scrollLeft, zoomRef.current);
        targetId = rowId ? findVideoClipAtTime(props.timeline, rowId, atSec)?.id : undefined;
      } else {
        const selectedOverlay = props.selectedId ? findOverlayInLayers(props.timeline.overlays, props.selectedId)?.clip : undefined;
        const overlayClip = selectedOverlay && props.playhead > selectedOverlay.startSec && props.playhead < selectedOverlay.startSec + overlayDuration(selectedOverlay) ? selectedOverlay : undefined;
        const videoClip = props.timeline.video.find((clip) => props.playhead > starts[clip.id]! && props.playhead < starts[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec));
        targetId = overlayClip?.id ?? videoClip?.id;
        atSec = props.playhead;
      }
      if (!targetId || atSec === undefined) return;
      event.preventDefault();
      try {
        const overlay = findOverlayInLayers(props.timeline.overlays, targetId);
        props.onEdit(overlay ? splitOverlayClip(props.timeline, targetId, atSec) : splitVideoClip(props.timeline, targetId, atSec));
      } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.timeline, props.playhead, props.selectedId, starts, props.onEdit, props.onError, displayRows]);

  const selectedTrack = (rowId: string) => rowId;
  const resetEditor = () => {
    const host = editorHost.current;
    const editGrid = host?.querySelector<HTMLElement>(VIDEO_TRACK_EDIT_GRID_SELECTOR);
    const rulerGrid = host?.querySelector<HTMLElement>(".timeline-editor-time-area .ReactVirtualized__Grid");
    const scrollTop = editGrid?.scrollTop ?? 0;
    const scrollLeft = rulerGrid?.scrollLeft ?? 0;
    setEditorKey((current) => current + 1);
    requestAnimationFrame(() => {
      ref.current?.setScrollLeft(scrollLeft);
      ref.current?.setScrollTop(scrollTop);
    });
  };
  const doEdit = (change: () => TimelineData) => {
    try {
      const next = change();
      if (isUnchangedTimeline(props.timeline, next)) {
        resetEditor();
        return;
      }
      props.onEdit(next);
    }
    catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  };
  const actionStyle = (action: StudioAction) => ({
    background: action.effectId === "main" ? "var(--u3-clip-video)" : action.effectId === "meme" ? "var(--u3-clip-meme)" : action.effectId === "overlay" ? (props.timeline.overlays.flat().some(c => c.id === action.id && "memeId" in c) ? "var(--u3-clip-meme)" : "var(--u3-clip-video)") : action.effectId === "caption" ? "var(--u3-clip-caption)" : tracks.find(t => t.id === action.effectId)?.color ?? "var(--muted)",
    borderRadius: `${action.groupBefore ? 0 : 6}px ${action.groupAfter ? 0 : 6}px ${action.groupAfter ? 0 : 6}px ${action.groupBefore ? 0 : 6}px`,
    color: "var(--foreground)",
    fontSize: 11,
    padding: "3px 5px",
    height: Math.min(22, timelineActionHeight()),
    margin: `${TIMELINE_ACTION_INSET}px 0`,
    display: "flex",
    position: "relative" as const,
    alignItems: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    boxSizing: "border-box" as const,
  });

  return <section className="studio-timeline" aria-label="타임라인" style={{
    "--studio-track-row-height": `${TRACK_ROW_HEIGHT}px`,
    "--studio-ruler-height": `${TIMELINE_RULER_HEIGHT}px`,
  } as CSSProperties}>
    {props.ttsBusy ? <div className="studio-tts-progress" role="status">
      <span>{props.ttsJob?.message ?? "음성 만들기 준비 중"}</span>
      <Progress className="max-w-60" value={(props.ttsJob?.progress ?? 0) * 100} aria-label="음성 만들기 진행률" />
      <Button size="xs" variant="secondary" disabled={!props.ttsJob} onClick={props.onCancelTts}>취소</Button>
    </div> : null}
    <div className="studio-timeline-body">
      <div className="studio-track-labels" style={{ width: timelineTrackHeaderLayout("", false, false).width }} onWheel={e => { ref.current?.setScrollTop(Math.max(0, Math.min((tracks.length - 10) * TRACK_ROW_HEIGHT, scrollTop + e.deltaY))); }}>
        <div className="studio-track-ruler" />
        <div className="studio-track-viewport" style={{ height: timelineEditorHeight(tracks.length) - TIMELINE_RULER_HEIGHT }}><div style={{ transform: `translateY(${-scrollTop}px)` }}>
        {tracks.map((track) => {
          const group = audioGroupForRow(track.id);
          const stems = Object.values(props.timeline.audio.stems ?? {});
          const muted = group === "source" ? props.timeline.audio.source.muted
            : group === "voice" ? props.timeline.audio.voice.muted
              : group === "sfx" ? props.timeline.audio.sfx.muted
                : group === "stem-voice" ? stems.length > 0 && stems.every((item) => item.voice.muted)
                  : group === "stem-bg" ? stems.length > 0 && stems.every((item) => item.bg.muted)
                    : false;
          return <TrackHeader key={track.id} title={track.name} selected={props.selectedId === track.id} onSelect={track.id === "captions" || /-(main|sub)$/.test(track.id) ? () => props.onSelect(track.id, "caption-layer") : undefined} actions={group ? <Button variant="ghost" size="icon-xs" aria-pressed={muted} onClick={() => props.onMute?.(group)} aria-label={muted ? `${track.name} 음소거 해제` : `${track.name} 음소거`} title="음소거"><HugeiconsIcon icon={VolumeIcon} size={14} /></Button> : undefined} />;
        })}
        </div></div>
      </div>
      <div className="studio-timeline-editor" ref={editorHost} onPointerDown={blurTimelineControlFocus}>
        <TimelineEditor
          key={editorKey}
          ref={ref}
          editorData={data as never}
          effects={{}}
          scale={1}
          scaleWidth={scaleWidthForZoom(props.zoom)}
          scaleSplitCount={5}
          rowHeight={TRACK_ROW_HEIGHT}
          minScaleCount={Math.max(20, Math.ceil((Math.max(1, ...props.timeline.video.map((clip) => starts[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec)), ...props.timeline.overlays.flatMap((layer) => layer.map((clip) => clip.startSec + overlayDuration(clip)))) / 10)))}
          gridSnap={props.snap}
          dragLine={props.snap}
          autoScroll
          enableRowDrag={false}
          style={{ height: timelineEditorHeight(tracks.length), width: "100%" }}
          getScaleRender={(scale) => <span className="studio-ruler-tick">{Math.round(scale)}s</span>}
          getActionRender={(action) => {
            const item = action as StudioAction;
            const label = labelForAction(action.id, props.timeline, props.inputs, sfxItems, memeItems);
            const textClip = captionLayersOf(props.timeline).flatMap(l => [...l.main, ...l.sub]).find(c => c.id === item.id);
            const marker = { position: "absolute" as const, top: 1, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "6px solid var(--muted-foreground)" };
            return <div style={actionStyle(item)} title={ttsWarnings.has(item.id) ? `${label} · 다음 음성과 겹쳐요` : label}>
              {ttsWarnings.has(item.id) ? <span className="studio-tts-warning" aria-label="다음 음성과 겹쳐요">!</span> : null}
              {item.startTransition?.kind.kind === "dissolve" ? <span aria-label="시작 디졸브" style={{ ...marker, left: 3 }} /> : null}
              {editingCaption === item.id && textClip ? <TextInput autoFocus aria-label="자막 바로 고치기" defaultValue={textClip.text} className="h-5 min-w-0 rounded-none border-0 bg-transparent p-0 text-xs" onPointerDown={e => e.stopPropagation()} onBlur={e => { props.onEdit(updateCaption(props.timeline, textClip.id, { text: e.target.value })); setEditingCaption(null); }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = textClip.text; e.currentTarget.blur(); } }} /> : <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
              {item.endTransition?.kind.kind === "dissolve" ? <span aria-label="끝 디졸브" style={{ ...marker, right: 3 }} /> : null}
            </div>;
          }}
          onScroll={({ scrollTop }) => setScrollTop(scrollTop)}
          onClickRow={() => props.onSelect(null, null)}
          onCursorDrag={(time) => props.onPlayhead(time)}
          onClickTimeArea={(time) => { blurTimelineControlFocus(); props.onPlayhead(time); return true; }}
          onClickAction={(event, { action, row }) => { blurTimelineControlFocus(); event.stopPropagation(); props.onSelect(action.id, selectedTrack(row.id), event.shiftKey); }}
          onActionMoveStart={({ action, row }) => {
            if (row.id === "video" || /^video-(?:[2-9]|[1-9]\d+)$/.test(row.id)) { dragTarget.current = { id: action.id, rowId: row.id, clientY: pointerPosition.current?.y ?? 0 }; }
          }}
          onActionMoveEnd={({ action, row, start }) => {
            const drag = dragTarget.current;
            dragTarget.current = null;
            if (!drag && (row.id === "video" || /^video-(?:[2-9]|[1-9]\d+)$/.test(row.id))) return;
            const grid = editorHost.current?.querySelector<HTMLElement>(VIDEO_TRACK_EDIT_GRID_SELECTOR);
            const y = drag?.clientY ?? 0;
            const targetRow = grid ? resolveVideoTrackAtPointer(displayRows.map((item) => item.id), y, grid.getBoundingClientRect().top, grid.scrollTop) : null;
            const sourceOverlay = findOverlayInLayers(props.timeline.overlays, action.id);
            if (targetRow === "video-new" && sourceOverlay && shouldResetNewTrackDrop({ overlayCount: props.timeline.overlays.length, sourceTrack: drag?.rowId ?? "", sourceClipCount: props.timeline.overlays[sourceOverlay.layer]?.length ?? 0 })) {
              resetEditor(); return;
            }
            const layerFor = (id: string) => id === "video-new" ? props.timeline.overlays.length : Number(id.slice("video-".length)) - 2;
            const groupId = props.timeline.video.find((clip) => clip.id === action.id)?.groupId ?? findOverlayInLayers(props.timeline.overlays, action.id)?.clip.groupId;
            const sourceStart = drag?.rowId === "video" ? videoStartTimes(props.timeline)[action.id] ?? start : findOverlayInLayers(props.timeline.overlays, action.id)?.clip.startSec ?? start;
            const decision = decideActionMove({ dragSourceTrack: drag?.rowId ?? null, editorRow: row.id, targetRow, sourceStart, start, groupId });
            if (decision.kind === "reset") {
              resetEditor();
              return;
            }
            if (decision.kind === "move-group" && groupId) {
              const groupFirstStart = Math.min(...[
                ...props.timeline.video.filter((clip) => clip.groupId === groupId).map((clip) => videoStartTimes(props.timeline)[clip.id]!),
                ...props.timeline.overlays.flat().filter((clip) => clip.groupId === groupId).map((clip) => clip.startSec),
              ]);
              const groupTargetStart = start - (sourceStart - groupFirstStart);
              doEdit(() => moveVideoGroup(props.timeline, groupId, { track: decision.targetTrack, startSec: groupTargetStart }, props.inputs ?? []));
            } else if (decision.kind === "video1-to-overlay") {
              doEdit(() => moveVideo1ClipToOverlay(props.timeline, action.id, props.inputs ?? [], layerFor(decision.targetTrack)));
            } else if (decision.kind === "overlay-to-video1") {
              doEdit(() => moveOverlayClipToVideo1(props.timeline, action.id, start, [crypto.randomUUID(), crypto.randomUUID()]));
            } else if (decision.kind === "overlay-to-overlay") {
              doEdit(() => moveOverlayClipToLayer(props.timeline, action.id, layerFor(decision.targetTrack)));
            } else if (decision.kind === "reorder-video1") doEdit(() => reorderVideoByStart(props.timeline, action.id, start));
            else if (decision.kind === "move-overlay") doEdit(() => moveOverlayClip(props.timeline, action.id, start));
            else if (decision.kind === "move-caption") doEdit(() => moveCaptionClip(props.timeline, action.id, start));
            else if (decision.kind === "move-audio") doEdit(() => ({ ...props.timeline, [decision.track]: moveAudioClip(props.timeline[decision.track], action.id, start) }));
          }}
          onActionResizeEnd={({ action, row, start, end, dir }) => {
            const edge = dir === "left" ? "start" : "end";
            if (row.id === "video") {
              const clip = props.timeline.video.find((item) => item.id === action.id);
              const toSec = dir === "left" ? start : end;
              if (clip?.kind === "main" && "inStartSec" in clip) doEdit(() => trimVideoClip(props.timeline, action.id, edge, toSec, props.inputDurations?.[clip.inputId]));
              else if (clip) doEdit(() => trimVideoClip(props.timeline, action.id, edge, toSec));
            } else if (/^video-(?:[2-9]|[1-9]\d+)$/.test(row.id)) doEdit(() => trimOverlayClip(props.timeline, action.id, edge, dir === "left" ? start : end));
            else if (row.id === "captions" || /-main$|-sub$/.test(row.id)) doEdit(() => trimCaptionClip(props.timeline, action.id, edge, dir === "left" ? start : end));
            else if (row.id === "voice" || row.id === "sfx" || /^sfx-\d+$/.test(row.id)) {
              const clips = row.id === "voice" ? props.timeline.voice : props.timeline.sfx;
              const clip = clips.find((item) => item.id === action.id);
              if (!clip) return;
              const updated = trimAudioClip(clips, clip.id, edge, dir === "left" ? start : end, props.audioDurations?.[clip.file] ?? clip.inEndSec);
              doEdit(() => row.id === "voice" ? { ...props.timeline, voice: updated } : { ...props.timeline, sfx: normalizeSfxLanes(updated) });
            }
          }}
          onDoubleClickAction={(event, { action, row }) => {
            event.preventDefault(); event.stopPropagation();
            props.onSelect(action.id, selectedTrack(row.id), event.shiftKey);
            if (row.id === "captions" || /-(main|sub)$/.test(row.id)) setEditingCaption(action.id);
          }}
          onActionMoving={({ row }) => row.id === "source" || row.id.startsWith("stem-") ? false : undefined}
        />
      </div>
    </div>
  </section>;
}
