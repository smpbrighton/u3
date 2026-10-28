import type { SystemStatus } from "../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioCache, AudioCacheEntry, Project, Timeline as TimelineData, VideoClip } from "../../core/schema";
import { clipDuration, projectDuration, setAudioClipSpeed, setOverlayClipSpeed, setVideoClipSpeed, videoDuration, videoStartTimes, VIDEO_TRACK_REQUIRED_MESSAGE } from "../../core/timeline/ops";
import { createHistory, pushHistory, redo, undo, type TimelineHistory } from "../../core/timeline/history";
import { Button } from "../components/ui/button";
import { BusyButton } from "../components/u3/BusyButton";
import { Toolbar } from "../components/u3/Toolbar";
import { Popover } from "radix-ui";
import { Notification03Icon, KeyboardIcon } from "@hugeicons/core-free-icons";
import { captionLayersOf } from "../../core/schema";
import { extendStudioSelection, studioTrackForClip } from "../studio/selection";
import type { StudioTab } from "../studio/LibraryPanel";
import "../studio/studio.css";
import { Preview } from "../studio/Preview";
import { Timeline } from "../studio/Timeline";
import { Inspector, type SpeedJob } from "../studio/Inspector";
import { LibraryPanel, type LibraryDragItem } from "../studio/LibraryPanel";
import { api, watchJob, type EngineJob } from "../api";
import { applyTtsResults, ttsItemsFromTimeline, type TtsResult } from "../../core/tts-clips";
import { ExportDialog } from "../ExportDialog";
import { StudioSlider, StudioSwitch } from "../components/u3/StudioControls";
import { ArrowLeft01Icon, PlayIcon, PauseIcon, Undo02Icon, Redo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { replaceMemeClip } from "../studio/replace-meme-clip";
import { scaleWidthForZoom } from "../studio/timeline-zoom";
import { decideOverlayDrop } from "../studio/overlay-drop";
import { VIDEO_TRACK_EDIT_GRID_SELECTOR } from "../studio/video-track-drop";
import { TRACK_ROW_HEIGHT } from "../studio/timeline-layout";
import { DerivedCarouselDialog } from "./carousel/DerivedCarouselDialog";
import type { Carousel } from "../../core/carousel";
import { findOverlayInLayers, placeOverlayAtLayer, placeOverlayInLowestLayer, updateOverlayInLayers } from "../../core/timeline/overlay-layers";
import { canGroupVideoClips, groupVideoClips, selectVideoRange, ungroupVideoClips, type VideoClipRef } from "../../core/timeline/video-groups";
import { timelineToRender } from "../../core/timeline/to-render";
import { clampTimeToLastFrame } from "../studio/preview-seek";
import { studioShortcut } from "../studio/shortcuts";
import { DEFAULT_STUDIO_SHORTCUTS, formatChord, type StudioShortcutTable } from "../../core/studio-shortcuts";
import { uiPlatform } from "../platform";
import { ShortcutList } from "../studio/ShortcutList";
import { deleteStudioSelection } from "../studio/delete-selection";
import { libraryDropRows, decideNewLaneDrop } from "../studio/library-drop";
import { audioGroupForRow, nextSfxLane, sfxLane, sfxRowId } from "../../core/timeline/sfx-lanes";
import { useBeforeUpdateRestart } from "../update-save";
import { resolveLibraryDropPosition, resolvePointerDropTarget } from "../studio/library-drop";

import { cacheKey, clipSpeed } from "../../core/timeline/speed";
import { speedSourceMatches } from "../studio/preview-sources";

interface AudioPreparation extends AudioCacheEntry { key: string; noAudio?: false }
type AudioTask = { controller: AbortController; jobId?: string; clipId: string; projectId: string };

interface MemeItem { id: string; emotion: string; situations: string[]; description?: string; durationSec?: number; url: string }
interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }

export function Studio(props: {
  capabilities?: SystemStatus["capabilities"];
  project: Project;
  shortcuts?: StudioShortcutTable;
  initialTab?: StudioTab;
  notifications?: string[];
  onOpenSettings?: () => void;
  onProject: (project: Project) => void;
  onBack: () => void;
  onSnackbar: (message: string) => void;
  onError: (message: string) => void;
  onCarouselCreated: (carousel: Carousel) => void;
}) {
  const shortcuts = props.shortcuts ?? DEFAULT_STUDIO_SHORTCUTS;
  const [storedAudioCache, setAudioCache] = useState<AudioCache>({});
  const preparedFiles = useRef(new Map<string, string>());
  const audioCache = useMemo(() => Object.fromEntries(Object.entries(storedAudioCache).filter(([key]) => {
    const input = props.project.inputs.find(i => i.id === key.slice(0, key.lastIndexOf(":")));
    return !input || preparedFiles.current.get(key) === input.file;
  })), [storedAudioCache, props.project.inputs]);
  const audioCacheRef = useRef(audioCache);
  audioCacheRef.current = audioCache;
  const project = { ...props.project, audioCache };
  const projectRef = useRef(project);
  projectRef.current = project;
  const revision = useRef(0);
  const selectionRevision = useRef(0);
  const speedTask = useRef<AudioTask | null>(null);
  const [speedJob, setSpeedJob] = useState<SpeedJob | null>(null);
  const backgroundTasks = useRef(new Map<string, AudioTask>());
  const knownSilent = useRef(new Set<string>());
  const [loopCaption, setLoopCaption] = useState(false);
  const [processingBusy, setProcessingBusy] = useState(false);
  const savedTimeline = useRef(JSON.stringify(project.timeline));
  const [history, setHistory] = useState<TimelineHistory>(() => createHistory(project.timeline));
  const [playhead, setPlayhead] = useState(0);
  const [selected, setSelected] = useState<{ id: string | null; track: string | null }>({ id: null, track: null });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(4);
  const [snap, setSnap] = useState(true);
  const [safeZone, setSafeZone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlayingState] = useState(false);
  const setPlaying = useCallback((value: boolean) => {
    if (value) { audioCacheRef.current = {}; setAudioCache({}); knownSilent.current.clear(); }
    setPlayingState(value);
  }, []);
  const [recording, setRecording] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [createCarouselOpen, setCreateCarouselOpen] = useState(false);
  const [libraryDropGuide, setLibraryDropGuide] = useState<{ x: number; top: number; height: number } | null>(null);
  const timeline = history.present;
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const ttsTask = useRef<{ controller: AbortController; jobId?: string } | null>(null);
  const [ttsJob, setTtsJob] = useState<EngineJob | null>(null);
  const [ttsStarting, setTtsStarting] = useState(false);
  const ttsBusy = ttsStarting || Boolean(ttsJob && ["running", "queued"].includes(ttsJob.status));
  const duration = useMemo(() => Math.max(0.1, projectDuration(timeline, audioCache)), [timeline, audioCache]);
  const render = useMemo(() => timelineToRender(timeline, undefined, audioCache), [timeline, audioCache]);
  const starts = useMemo(() => videoStartTimes(timeline), [timeline]);

  useEffect(() => {
    setPlayhead((current) => clampTimeToLastFrame(current, render.durationInFrames, render.fps));
  }, [render.durationInFrames, render.fps]);

  useEffect(() => {
    savedTimeline.current = JSON.stringify(project.timeline);
    setHistory(createHistory(project.timeline));
    setSelected({ id: null, track: null });
    setSelectedIds([]);
  }, [project.id]);

  const edit = useCallback((next: TimelineData) => {
    revision.current++;
    setHistory((current) => JSON.stringify(next) === JSON.stringify(current.present) ? current : pushHistory(current, next));
  }, []);

  useEffect(() => {
    setTtsJob(null);
    setTtsStarting(false);
    return () => {
      const task = ttsTask.current;
      ttsTask.current = null;
      task?.controller.abort();
      if (task?.jobId) void api("DELETE", `/api/jobs/${task.jobId}`).catch(() => undefined);
    };
  }, [project.id]);

  function cancelSpeed() {
    const task = speedTask.current;
    if (!task) return;
    task.controller.abort();
    if (task.jobId) void api("DELETE", `/api/jobs/${task.jobId}`).catch(() => undefined);
    speedTask.current = null;
    setSpeedJob(null);
  }

  function cacheResult(result: AudioPreparation, nextTimeline = timelineRef.current) {
    const sourceId = result.key.slice(0, result.key.lastIndexOf(":"));
    preparedFiles.current.set(result.key, projectRef.current.inputs.find(i => i.id === sourceId)?.file ?? sourceId);
    const nextCache = { ...audioCacheRef.current, [result.key]: { file: result.file, durationSec: result.durationSec, version: result.version } };
    audioCacheRef.current = nextCache;
    setAudioCache(nextCache);
    props.onProject({ ...projectRef.current, timeline: nextTimeline, audioCache: nextCache });
  }

  async function prepareAudio(sourceId: string, speed: number, task: AudioTask, onJob: (job: EngineJob) => void) {
    const started = await api<EngineJob>("POST", `/api/projects/${task.projectId}/audio/prepare`, { sourceId, speed }, task.controller.signal);
    task.jobId = started.id;
    if (task.controller.signal.aborted) { await api("DELETE", `/api/jobs/${started.id}`); throw new Error("배속 준비를 취소했습니다"); }
    onJob(started);
    const finished = await watchJob(started.id, onJob, task.controller.signal);
    if (task.controller.signal.aborted || finished.status === "discarded") throw new Error("배속 준비를 취소했습니다");
    if (finished.status !== "done") throw new Error(finished.error ?? "배속 준비를 마치지 못했어요.");
    return finished.result as AudioPreparation | { key: string; version: string; noAudio: true };
  }

  async function setSpeed(clipId: string, track: "video" | "overlay" | "voice", speed: number) {
    if (speedTask.current) return;
    const before = timelineRef.current;
    const clip = track === "voice" ? before.voice.find(c => c.id === clipId) : track === "video" ? before.video.find(c => c.id === clipId) : before.overlays.flat().find(c => c.id === clipId);
    if (!clip || !("inStartSec" in clip) || clipSpeed(clip) === speed) return;
    const sourceId = "file" in clip ? clip.file : "inputId" in clip ? clip.inputId : "";
    const source = { projectId: projectRef.current.id, sourceId, file: "file" in clip ? clip.file : projectRef.current.inputs.find(i => i.id === sourceId)?.file ?? "" };
    const task: AudioTask = { controller: new AbortController(), clipId, projectId: projectRef.current.id };
    const selection = selectionRevision.current;
    let expected = JSON.stringify(clip);
    let preparedTimeline = before;
    try {
      if (track !== "voice") {
        const next = track === "video" ? setVideoClipSpeed(before, clipId, speed) : setOverlayClipSpeed(before, clipId, speed);
        preparedTimeline = next;
        edit(next);
        expected = JSON.stringify([...next.video, ...next.overlays.flat()].find(c => c.id === clipId));
        if (speed === 1) return;
      }
      const atRevision = revision.current;
      speedTask.current = task;
      setSpeedJob({ clipId, job: null, cancel: cancelSpeed });
      const onJob = (job: EngineJob) => { if (speedTask.current === task) setSpeedJob({ clipId, job, cancel: cancelSpeed }); };
      // 준비 라우트는 저장된 원본 식별자로만 파일을 찾는다.
      await api("PUT", `/api/projects/${task.projectId}`, { ...projectRef.current, timeline: preparedTimeline, savedAt: new Date().toISOString() }, task.controller.signal);
      const result = await prepareAudio(sourceId, speed, task, onJob);
      const current = track === "voice" ? timelineRef.current.voice.find(c => c.id === clipId) : [...timelineRef.current.video, ...timelineRef.current.overlays.flat()].find(c => c.id === clipId);
      if (task.controller.signal.aborted || !speedSourceMatches({ ...projectRef.current, timeline: timelineRef.current }, source) || selectionRevision.current !== selection || revision.current !== atRevision || JSON.stringify(current) !== expected) return;
      if (result.noAudio) { knownSilent.current.add(result.key); return; }
      if (track === "voice") {
        const next = setAudioClipSpeed(timelineRef.current, clipId, speed);
        cacheResult(result, next);
        edit(next);
      } else cacheResult(result);
    } catch (reason) { if (!task.controller.signal.aborted) props.onSnackbar(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (speedTask.current === task) { speedTask.current = null; setSpeedJob(null); } }
  }

  useEffect(() => { selectionRevision.current++; cancelSpeed(); }, [selected.id, selected.track]);
  useEffect(() => {
    audioCacheRef.current = {};
    setAudioCache({});
    knownSilent.current.clear();
    return () => {
      cancelSpeed();
      for (const task of backgroundTasks.current.values()) {
        task.controller.abort();
        if (task.jobId) void api("DELETE", `/api/jobs/${task.jobId}`).catch(() => undefined);
      }
      backgroundTasks.current.clear();
    };
  }, [project.id]);

  const sourceFilesKey = JSON.stringify(project.inputs.map(i => [i.id, i.file] as const).sort((a, b) => a[0].localeCompare(b[0])));
  useEffect(() => {
    audioCacheRef.current = {};
    setAudioCache({});
    knownSilent.current.clear();
    cancelSpeed();
    for (const task of backgroundTasks.current.values()) {
      task.controller.abort();
      if (task.jobId) void api("DELETE", `/api/jobs/${task.jobId}`).catch(() => undefined);
    }
    backgroundTasks.current.clear();
  }, [sourceFilesKey]);

  const preparationKey = JSON.stringify([...timeline.video, ...timeline.overlays.flat(), ...timeline.voice].filter(c => "inStartSec" in c && clipSpeed(c) !== 1).map(c => [c.id, "file" in c ? c.file : "inputId" in c ? c.inputId : "", clipSpeed(c)]));
  useEffect(() => {
    const clips = [...timelineRef.current.video, ...timelineRef.current.overlays.flat(), ...timelineRef.current.voice];
    for (const clip of clips) {
      if (!("inStartSec" in clip) || clipSpeed(clip) === 1) continue;
      const sourceId = "file" in clip ? clip.file : "inputId" in clip ? clip.inputId : "";
      const source = { projectId: project.id, sourceId, file: "file" in clip ? clip.file : project.inputs.find(i => i.id === sourceId)?.file ?? "" };
      const speed = clipSpeed(clip), key = cacheKey(sourceId, speed);
      if (audioCacheRef.current[key] || knownSilent.current.has(key) || backgroundTasks.current.has(key) || speedTask.current?.clipId === clip.id) continue;
      const task: AudioTask = { controller: new AbortController(), clipId: clip.id, projectId: project.id };
      backgroundTasks.current.set(key, task);
      const cancel = () => { task.controller.abort(); if (task.jobId) void api("DELETE", `/api/jobs/${task.jobId}`).catch(() => undefined); setSpeedJob(current => current?.clipId === clip.id ? null : current); };
      if (!speedTask.current) setSpeedJob({ clipId: clip.id, job: null, cancel });
      const onJob = (job: EngineJob) => { if (!speedTask.current && !task.controller.signal.aborted) setSpeedJob({ clipId: clip.id, job, cancel }); };
      void prepareAudio(sourceId, speed, task, onJob).then(result => {
        if (task.controller.signal.aborted || !speedSourceMatches({ ...projectRef.current, timeline: timelineRef.current }, source)) return;
        if (result.noAudio) knownSilent.current.add(key);
        else cacheResult(result);
      }).catch(reason => { if (!task.controller.signal.aborted) props.onSnackbar(reason instanceof Error ? reason.message : String(reason)); }).finally(() => {
        if (backgroundTasks.current.get(key) === task) backgroundTasks.current.delete(key);
        if (!speedTask.current) setSpeedJob(current => current?.cancel === cancel ? null : current);
      });
    }
  }, [project.id, preparationKey, playing, sourceFilesKey]);

  async function generateTts(captionId?: string) {
    if (!props.capabilities?.tts) return;
    if (ttsTask.current || processingBusy || exportOpen) return;
    const items = ttsItemsFromTimeline(timelineRef.current).filter(item => !captionId || item.captionId === captionId);
    if (!items.length) { props.onSnackbar("음성으로 만들 자막이 없어요."); return; }
    const task: { controller: AbortController; jobId?: string } = { controller: new AbortController() };
    ttsTask.current = task;
    setTtsJob(null);
    setTtsStarting(true);
    try {
      await api("PUT", `/api/projects/${project.id}`, { ...projectRef.current, timeline: timelineRef.current, savedAt: new Date().toISOString() }, task.controller.signal);
      const started = await api<EngineJob>("POST", `/api/projects/${project.id}/tts`, { items });
      task.jobId = started.id;
      if (task.controller.signal.aborted) { await api("DELETE", `/api/jobs/${started.id}`); return; }
      setTtsJob(started);
      const final = await watchJob(started.id, setTtsJob, task.controller.signal);
      if (task.controller.signal.aborted || final.status === "discarded") return;
      if (final.status !== "done") throw new Error(final.error ?? "음성을 만들지 못했어요.");
      const results = final.result as TtsResult[];
      const nextCache = { ...audioCacheRef.current };
      for (const result of results) if (result.cache) nextCache[result.cache.key] = result.cache;
      audioCacheRef.current = nextCache;
      setAudioCache(nextCache);
      const next = applyTtsResults(timelineRef.current, results);
      edit(next);
      const saved = await api<Project>("PUT", `/api/projects/${project.id}`, { ...projectRef.current, audioCache: nextCache, timeline: next, savedAt: new Date().toISOString() });
      if (task.controller.signal.aborted) return;
      savedTimeline.current = JSON.stringify(next);
      props.onProject(saved);
      props.onSnackbar("음성을 만들었어요.");
    } catch (error) {
      if (!task.controller.signal.aborted) props.onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (ttsTask.current === task) { ttsTask.current = null; setTtsStarting(false); }
    }
  }

  async function cancelTts() {
    const task = ttsTask.current;
    if (!task?.jobId) return;
    try { await api("DELETE", `/api/jobs/${task.jobId}`); }
    catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  }

  const addVoice = useCallback((file: string, durationSec: number) => {
    const clip = { id: crypto.randomUUID(), startSec: playhead, file, inStartSec: 0, inEndSec: durationSec, gain: 1 };
    edit({ ...history.present, voice: [...history.present.voice, clip] });
  }, [edit, history.present, playhead]);

  const moveHistory = useCallback((direction: "undo" | "redo") => {
    revision.current++;
    setHistory((current) => direction === "undo" ? undo(current) : redo(current));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = studioShortcut({
        key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey,
        altKey: event.altKey, shiftKey: event.shiftKey, isComposing: event.isComposing,
        keyCode: event.keyCode, targetTagName: (event.target as HTMLElement | null)?.tagName,
        targetType: (event.target as HTMLInputElement | null)?.type,
        targetRole: (event.target as HTMLElement | null)?.closest("[role]")?.getAttribute("role") ?? undefined,
        targetIsContentEditable: (event.target as HTMLElement | null)?.isContentEditable,
      }, shortcuts);
      if (event.key === "Escape" && !(event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true], [role=dialog]")) { setSelected({ id: null, track: null }); setSelectedIds([]); return; }
      if (shortcut === "undo" || shortcut === "redo") {
        event.preventDefault(); moveHistory(shortcut); return;
      }
      if (shortcut === "toggle-play") {
        event.preventDefault();
        if (!event.repeat && !recording) setPlaying(!playing);
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
          const result = deleteStudioSelection(next, studioTrackForClip(next, id, selected.track), id);
          if (result.blocked) { props.onSnackbar(VIDEO_TRACK_REQUIRED_MESSAGE); event.preventDefault(); return; }
          next = result.timeline;
        }
        edit(next); setSelected({ id: null, track: null }); setSelectedIds([]);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveHistory, timeline, selected, selectedIds, edit, props.onSnackbar, recording, shortcuts, playing, setPlaying]);

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const saved = await api<Project>("PUT", `/api/projects/${project.id}`, { ...project, timeline, savedAt: new Date().toISOString() });
      savedTimeline.current = JSON.stringify(timeline);
      props.onProject(saved);
      props.onSnackbar("저장했어요");
      return true;
    } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); return false; }
    finally { setSaving(false); }
  }

  useBeforeUpdateRestart(async () => {
    if (recording) throw new Error("녹음을 마친 뒤 다시 시작해 주세요.");
    if (!await save()) throw new Error("프로젝트를 저장하지 못했어요.");
  });

  function addVideo(inputId: string, at = videoDuration(timeline)) {
    const input = project.inputs.find((item) => item.id === inputId);
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
    const input = project.inputs.find((item) => item.id === source.id);
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
      const position = target.kind === "timeline" && gridRect ? resolveLibraryDropPosition({ pointerX: clientX, pointerY: clientY, gridLeft: gridRect.left, gridTop: gridRect.top, scrollLeft: grid!.scrollLeft, scrollTop: grid!.scrollTop, scaleWidth: scaleWidthForZoom(zoom), rows: libraryDropRows(timeline) }) : null;
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
      const hitsVideoClip = timeline.video.some((clip) => atSec >= startsAt[clip.id]! && atSec < startsAt[clip.id]! + clipDuration(clip));
      const decision = decideOverlayDrop({ source: { kind: project.inputs.find((input) => input.id === item.id)?.kind ?? "video", id: item.id }, targetTrack: targetTrack === "video" ? "video" : /^video-(?:[2-9]|[1-9]\d+)$/.test(targetTrack) ? "overlay" : "other", hitsVideoClip, atSec, videoDurationSec: videoDuration(timeline) });
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

  return <section className="u3-shell studio-screen" aria-label="스튜디오">
    <header className="studio-header">
      <Button className="studio-back-button" variant="ghost" title="2 대본" aria-label="대본으로 돌아가기" onClick={props.onBack}><HugeiconsIcon icon={ArrowLeft01Icon} size={18} /></Button>
      <strong className="studio-project-name">{project.name}</strong>
      <Popover.Root><Popover.Trigger asChild><Button variant="ghost" size="icon" title="알림" aria-label={`알림 ${props.notifications?.length ?? 0}개`} className="relative"><HugeiconsIcon icon={Notification03Icon} size={18} />{props.notifications?.length ? <span className="absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-u3-solid px-0.5 text-[10px] font-bold text-u3-solid-foreground">{props.notifications.length}</span> : null}</Button></Popover.Trigger><Popover.Portal><Popover.Content className="u3-shell z-50 grid w-80 gap-2 rounded-lg border border-border bg-popover p-4 text-xs text-foreground shadow-lg" align="end" sideOffset={8}><strong>알림</strong>{props.notifications?.length ? props.notifications.map((message, i) => <p key={i}>{message}</p>) : <p className="text-muted-foreground">알림이 없어요</p>}</Popover.Content></Popover.Portal></Popover.Root>
      <Button variant="outline" onClick={() => setCreateCarouselOpen(true)}>캐러셀 만들기</Button>
      <Button variant="secondary" disabled={saving} aria-busy={saving} onClick={() => void save()}>저장{savedTimeline.current !== JSON.stringify(timeline) ? <span className="size-1.5 rounded-full bg-foreground" aria-label="저장하지 않은 변경" /> : null}</Button>
      <BusyButton variant="default" disabled={ttsBusy || processingBusy || recording} title={ttsBusy || processingBusy ? "다른 작업이 끝난 뒤 시작할 수 있어요" : undefined} onClick={() => void save().then(saved => { if (saved) setExportOpen(true); })}>mp4 내보내기</BusyButton>
    </header>
    <div className="studio-workspace">
      <LibraryPanel capabilities={props.capabilities} initialTab={props.initialTab} onSelect={(id, track) => { setSelected({ id, track }); setSelectedIds([id]); }} onSeek={setPlayhead} onEdit={edit} loop={loopCaption} onLoopChange={setLoopCaption} onGenerateTts={() => void generateTts()} ttsBusy={ttsBusy} processingBusy={processingBusy} project={{ ...project, timeline }} selectedId={selected.id} playhead={playhead} onAddVoice={addVoice} onRecordingChange={(active) => { setRecording(active); if (active) setPlaying(false); }} onAddVideo={(id) => addVideo(id)} onSelectMeme={(meme) => addMeme(meme, timeline.video.find((clip) => clip.id === selected.id && clip.kind === "meme")?.id)} onAddSfx={addSfx} onPointerDrop={(item, x, y) => void addLibraryItemAt(item, x, y)} onPointerMove={updateLibraryDropGuide} onPointerCancel={() => setLibraryDropGuide(null)} onProject={props.onProject} onError={props.onError} onSnackbar={props.onSnackbar} />
      <section className="studio-preview-area" aria-label="미리보기">
        <Preview loopRange={loopCaption ? (() => { const clip = captionLayersOf(timeline).flatMap(l => [...l.main, ...l.sub]).find(c => c.id === selected.id); return clip ? { startSec: clip.startSec, endSec: clip.endSec } : null; })() : null} project={{ ...project, timeline }} time={playhead} playing={playing} muteOriginal={recording} onTime={setPlayhead} onPlaying={setPlaying} selectedId={selected.id} selectedIds={selectedIds} safeZone={safeZone} onSelectTarget={(id, kind) => {
          const found = findOverlayInLayers(timeline.overlays, id);
          const track = kind === "caption" ? `${captionLayersOf(timeline).find(l => [...l.main, ...l.sub].some(c => c.id === id))?.id}-${captionLayersOf(timeline).some(l => l.sub.some(c => c.id === id)) ? "sub" : "main"}` : kind === "caption-layer" ? "caption-layer" : kind === "watermark" ? "brand" : `video-${(found?.layer ?? 0) + 2}`;
          setSelected({ id, track }); setSelectedIds([id]);
        }} onEditTimeline={edit} />
        <div className="studio-playback-controls">
          <Button size="icon" variant="secondary" title={playing ? "일시 정지" : "재생"} aria-label={playing ? "일시 정지" : "재생"} disabled={recording} onClick={() => setPlaying(!playing)}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={18} /></Button>
          <span>{timeLabel(playhead)} / {timeLabel(duration)}</span>
          <StudioSlider label="재생 헤드" min={0} max={duration} step={0.01} value={Math.min(playhead, duration)} onChange={setPlayhead} />
        </div>
      </section>
      <Inspector capabilities={props.capabilities} onSpeed={(id, track, speed) => void setSpeed(id, track, speed)} speedJob={speedJob} onOpenSettings={props.onOpenSettings} onProcessingChange={setProcessingBusy} onDelete={() => { let next = timeline; for (const id of selectedIds) { const result = deleteStudioSelection(next, studioTrackForClip(next, id, selected.track ?? ""), id); if (result.blocked) { props.onSnackbar(VIDEO_TRACK_REQUIRED_MESSAGE); return; } next = result.timeline; } edit(next); setSelected({ id: null, track: null }); setSelectedIds([]); }} project={{ ...project, timeline }} selectedId={selected.id} selectedIds={selectedIds} selectedTrack={selected.track} timeline={timeline} onChange={edit} onProject={props.onProject} onSnackbar={props.onSnackbar} onUngroup={() => edit(ungroupVideoClips(timeline, selectedIds))} onGenerateTts={id => void generateTts(id)} ttsBusy={ttsBusy} />
    </div>
    <Toolbar className="studio-edit-toolbar" aria-label="편집 도구">
      <Button
        className="studio-history-button"
        variant="ghost"
        size="icon-sm"
        aria-label={`실행 취소 ${formatChord(shortcuts.undo, uiPlatform())}`}
        disabled={!history.past.length}
        onClick={() => moveHistory("undo")}
      >
        <HugeiconsIcon icon={Undo02Icon} size={16} />
      </Button>
      <Button
        className="studio-history-button"
        variant="ghost"
        size="icon-sm"
        aria-label={`다시 실행 ${formatChord(shortcuts.redo, uiPlatform())}`}
        disabled={!history.future.length}
        onClick={() => moveHistory("redo")}
      >
        <HugeiconsIcon icon={Redo02Icon} size={16} />
      </Button>
      <span className="studio-toolbar-spacer" />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">세이프존<StudioSwitch label="세이프존" checked={safeZone} onChange={setSafeZone} /></label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">스냅<StudioSwitch label="스냅" checked={snap} onChange={setSnap} /></label>
      <label className="studio-zoom"><span>가로 확대</span><span className="studio-zoom-slider"><StudioSlider label="가로 확대" min={1} max={10} step={0.1} value={zoom} onChange={setZoom} /></span><output>{zoom.toFixed(1)}×</output></label>
      <Popover.Root>
        <Popover.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label="단축키"><HugeiconsIcon icon={KeyboardIcon} size={16} /></Button></Popover.Trigger>
        <Popover.Portal><Popover.Content className="u3-shell z-50 w-72 rounded-lg border border-border bg-popover p-4 text-foreground shadow-lg" align="end" sideOffset={8} aria-label="단축키 목록"><ShortcutList shortcuts={shortcuts} /></Popover.Content></Popover.Portal>
      </Popover.Root>
    </Toolbar>
    <div className="studio-timeline-drop">
      {libraryDropGuide ? <div className="studio-library-drop-guide" style={{ left: libraryDropGuide.x, top: libraryDropGuide.top, height: libraryDropGuide.height }} /> : null}
      <Timeline capabilities={props.capabilities} shortcuts={shortcuts} audioCache={audioCache} timeline={timeline} inputs={project.inputs} playhead={playhead} zoom={zoom} snap={snap} selectedId={selected.id} selectedIds={selectedIds} onGenerateTts={() => void generateTts()} onCancelTts={() => void cancelTts()} ttsBusy={ttsBusy} ttsJob={ttsJob} onSelect={(id, track, shift) => {
        if (!id) { setSelected({ id: null, track: null }); setSelectedIds([]); return; }
        const range = shift && selected.id && selected.track === track && (track === "video" || /^video-/.test(track ?? "")) ? selectVideoRange(timeline, track ?? "", selected.id, id).map(item => item.id) : [];
        const ids = extendStudioSelection(selectedIds, id, Boolean(shift), range);
        const expanded = expandVideoGroupSelection(timeline, ids);
        setSelected({ id, track }); setSelectedIds(expanded);
      }} onPlayhead={setPlayhead} onEdit={edit} onError={props.onError} onBlocked={props.onSnackbar} onZoomChange={setZoom} onMute={toggleMute} inputDurations={Object.fromEntries(project.inputs.map((input) => [input.id, input.durationSec ?? 1]))} />
    </div>
    {exportOpen ? <ExportDialog projectId={project.id} projectName={project.name} timelineLength={duration} onClose={() => setExportOpen(false)} onSnackbar={props.onSnackbar} /> : null}
    <DerivedCarouselDialog open={createCarouselOpen} projectId={project.id} onClose={() => setCreateCarouselOpen(false)} onCreated={props.onCarouselCreated} onError={props.onError} />
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
