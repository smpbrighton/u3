import { Timeline as TimelineEditor, type TimelineState } from "@xzdarcy/react-timeline-editor";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Input, Timeline as TimelineData } from "../../core/schema";
import { VolumeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { deleteAudioClip, deleteCaptionClip, moveAudioClip, moveCaptionClip, splitVideoClip, trimAudioClip, trimCaptionClip, trimVideoClip, videoStartTimes } from "../../core/timeline/ops";
import { labelForAction, timelineToStudioRows, reorderVideoByStart, type StudioAction, type SfxLabel } from "./timeline-adapter";
import { api } from "../api";
import { scaleWidthForZoom, scrollLeftForZoomAnchor, zoomFromPinch, zoomFromWheel } from "./timeline-zoom";
import { TIMELINE_ACTION_INSET, TIMELINE_RULER_HEIGHT, TRACK_ROW_HEIGHT, timelineActionHeight, timelineEditorHeight } from "./timeline-layout";

const TRACKS = [
  { id: "captions", name: "자막", color: "#F7A54A" },
  { id: "video", name: "영상", color: "#608CF5" },
  { id: "source", name: "원본 소리", color: "#56B981" },
  { id: "stem-voice", name: "목소리", color: "#24A872" },
  { id: "stem-bg", name: "배경", color: "#6FAF8A" },
  { id: "voice", name: "음성", color: "#9673DD" },
  { id: "sfx", name: "효과음", color: "#E276A7" },
];

export function Timeline(props: {
  timeline: TimelineData;
  inputs?: readonly Input[];
  playhead: number;
  zoom: number;
  snap: boolean;
  inputDurations?: Record<string, number>;
  audioDurations?: Record<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null, track: string | null) => void;
  onPlayhead: (time: number) => void;
  onEdit: (timeline: TimelineData) => void;
  onError: (message: string) => void;
  onSnapChange?: (enabled: boolean) => void;
  onZoomChange?: (zoom: number) => void;
  onMute?: (track: string) => void;
}) {
  const ref = useRef<TimelineState>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(props.zoom);
  const gestureZoom = useRef(props.zoom);
  const [sfxItems, setSfxItems] = useState<SfxLabel[]>([]);
  const rows = useMemo(() => timelineToStudioRows(props.timeline), [props.timeline]);
  const tracks = TRACKS.filter((track) => rows.some((row) => row.id === track.id));
  const starts = useMemo(() => videoStartTimes(props.timeline), [props.timeline]);
  const data = rows.map((item) => ({ ...item, actions: item.actions.map((action) => ({ ...action, selected: action.id === props.selectedId })) }));

  useEffect(() => {
    let active = true;
    void api<SfxLabel[]>("GET", "/api/library/sfx").then(items => { if (active) setSfxItems(items); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    ref.current?.setTime(props.playhead);
  }, [props.playhead]);

  useEffect(() => { zoomRef.current = props.zoom; }, [props.zoom]);

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
      if (event.key.toLowerCase() !== "s" || event.metaKey || event.ctrlKey || event.altKey || isTextInput(event.target)) return;
      const videoClip = props.timeline.video.find((clip) => props.playhead > starts[clip.id]! && props.playhead < starts[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec));
      if (!videoClip) return;
      event.preventDefault();
      try { props.onEdit(splitVideoClip(props.timeline, videoClip.id, props.playhead)); }
      catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.timeline, props.playhead, starts, props.onEdit, props.onError]);

  const selectedTrack = (rowId: string) => rowId;
  const doEdit = (change: () => TimelineData) => {
    try { props.onEdit(change()); }
    catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  };
  const actionStyle = (action: StudioAction) => ({
    background: TRACKS.find((track) => track.id === action.effectId)?.color ?? "#8A929E",
    borderRadius: 6,
    color: "#fff",
    fontSize: 11,
    padding: "3px 5px",
    height: timelineActionHeight(),
    margin: `${TIMELINE_ACTION_INSET}px 0`,
    display: "flex",
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
    <div className="studio-timeline-toolbar">
      <div className="studio-track-labels studio-track-labels--toolbar" />
      <span>재생 헤드에서 자르기 <kbd>S</kbd></span>
      <label>스냅 <input type="checkbox" checked={props.snap} onChange={(event) => props.onSnapChange?.(event.currentTarget.checked)} /></label>
      <label className="studio-zoom">확대 <input type="range" min="1" max="10" step="0.1" value={props.zoom} onChange={(event) => props.onZoomChange?.(Number(event.currentTarget.value))} /><output>{props.zoom.toFixed(1)}×</output></label>
    </div>
    <div className="studio-timeline-body">
      <div className="studio-track-labels">
        <div className="studio-track-ruler" />
        {tracks.map((track) => <div key={track.id} className="studio-track-label" style={{ borderLeftColor: track.color }}>
          <span>{track.name}</span>
          {(track.id === "source" || track.id === "stem-voice" || track.id === "stem-bg" || track.id === "voice" || track.id === "sfx") && <button type="button" aria-label={`${track.name} 음소거`} onClick={() => props.onMute?.(track.id)}><HugeiconsIcon icon={VolumeIcon} size={16} /></button>}
        </div>)}
      </div>
      <div className="studio-timeline-editor" ref={editorHost}>
        <TimelineEditor
          ref={ref}
          editorData={data as never}
          effects={{}}
          scale={1}
          scaleWidth={scaleWidthForZoom(props.zoom)}
          scaleSplitCount={5}
          rowHeight={TRACK_ROW_HEIGHT}
          minScaleCount={Math.max(20, Math.ceil((Math.max(1, ...props.timeline.video.map((clip) => starts[clip.id]! + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec))) / 10)))}
          gridSnap={props.snap}
          dragLine={props.snap}
          autoScroll
          enableRowDrag={false}
          style={{ height: timelineEditorHeight(tracks.length), width: "100%" }}
          getScaleRender={(scale) => <span className="studio-ruler-tick">{Math.round(scale)}s</span>}
          getActionRender={(action) => <div style={actionStyle(action as StudioAction)} title={labelForAction(action.id, props.timeline, props.inputs, sfxItems)}>{labelForAction(action.id, props.timeline, props.inputs, sfxItems)}</div>}
          onCursorDrag={(time) => props.onPlayhead(time)}
          onClickTimeArea={(time) => { props.onPlayhead(time); return true; }}
          onClickAction={(event, { action, row }) => { event.stopPropagation(); props.onSelect(action.id, selectedTrack(row.id)); }}
          onActionMoveEnd={({ action, row, start }) => {
            if (row.id === "video") doEdit(() => reorderVideoByStart(props.timeline, action.id, start));
            else if (row.id === "captions") doEdit(() => moveCaptionClip(props.timeline, action.id, start));
            else if (row.id === "voice") doEdit(() => ({ ...props.timeline, voice: moveAudioClip(props.timeline.voice, action.id, start) }));
            else if (row.id === "sfx") doEdit(() => ({ ...props.timeline, sfx: moveAudioClip(props.timeline.sfx, action.id, start) }));
          }}
          onActionResizeEnd={({ action, row, start, end, dir }) => {
            const edge = dir === "left" ? "start" : "end";
            if (row.id === "video") {
              const clip = props.timeline.video.find((item) => item.id === action.id);
              const toSec = dir === "left" ? start : end;
              if (clip?.kind === "main" && "inStartSec" in clip) doEdit(() => trimVideoClip(props.timeline, action.id, edge, toSec, props.inputDurations?.[clip.inputId]));
              else if (clip) doEdit(() => trimVideoClip(props.timeline, action.id, edge, toSec));
            } else if (row.id === "captions") doEdit(() => trimCaptionClip(props.timeline, action.id, edge, dir === "left" ? start : end));
            else if (row.id === "voice" || row.id === "sfx") {
              const clips = row.id === "voice" ? props.timeline.voice : props.timeline.sfx;
              const clip = clips.find((item) => item.id === action.id);
              if (!clip) return;
              const updated = trimAudioClip(clips, clip.id, edge, dir === "left" ? start : end, props.audioDurations?.[clip.file] ?? clip.inEndSec);
              doEdit(() => ({ ...props.timeline, [row.id]: updated }));
            }
          }}
          onDoubleClickAction={(event, { action, row }) => {
            event.preventDefault();
            if (row.id === "captions") doEdit(() => ({ ...props.timeline, captions: deleteCaptionClip(props.timeline.captions, action.id) }));
            if (row.id === "voice") doEdit(() => ({ ...props.timeline, voice: deleteAudioClip(props.timeline.voice, action.id) }));
            if (row.id === "sfx") doEdit(() => ({ ...props.timeline, sfx: deleteAudioClip(props.timeline.sfx, action.id) }));
          }}
          onActionMoving={({ row }) => row.id === "source" || row.id.startsWith("stem-") ? false : undefined}
        />
      </div>
    </div>
  </section>;
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

