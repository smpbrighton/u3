import { captionLayersOf, withCaptionLayers, Speed, type AudioClip, type OverlayClip, type TextClip, type Timeline, type VideoClip } from "../schema";
import { findOverlayInLayers, removeOverlayFromLayers, updateOverlayInLayers } from "./overlay-layers";

import { audioClipLength, clipSpeed, playLength, sourceAt } from "./speed";

export const VIDEO_TRACK_REQUIRED_MESSAGE = "영상 1에는 클립이 하나 이상 있어야 합니다";

export function clipDuration(clip: VideoClip): number {
  return "durationSec" in clip ? clip.durationSec : playLength(clip.inStartSec, clip.inEndSec, clipSpeed(clip));
}

export function videoStartTimes(timeline: Timeline): Record<string, number> {
  let at = 0;
  const starts: Record<string, number> = {};
  for (const clip of timeline.video) {
    starts[clip.id] = at;
    at += clipDuration(clip);
  }
  return starts;
}

export function videoDuration(timeline: Timeline): number {
  return timeline.video.reduce((sum, clip) => sum + clipDuration(clip), 0);
}

export function overlayDuration(clip: OverlayClip): number {
  return "durationSec" in clip ? clip.durationSec : playLength(clip.inStartSec, clip.inEndSec, clipSpeed(clip));
}

export function moveOverlayClip(timeline: Timeline, clipId: string, startSec: number): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`overlay 클립을 찾을 수 없습니다: ${clipId}`);
  if (!Number.isFinite(startSec) || startSec < 0 || startSec + overlayDuration(found.clip) > videoDuration(timeline)) throw new RangeError("겹친 영상은 본 영상 길이 안에서 이동해야 합니다");
  return { ...timeline, overlays: updateOverlayInLayers(timeline.overlays, clipId, (clip) => ({ ...clip, startSec })) };
}

export function trimOverlayClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`overlay 클립을 찾을 수 없습니다: ${clipId}`);
  const clip = found.clip;
  const end = clip.startSec + overlayDuration(clip);
  if (edge === "start" ? toSec <= clip.startSec || toSec >= end : toSec <= clip.startSec || toSec > videoDuration(timeline)) throw new RangeError("겹친 영상 트림 구간이 올바르지 않습니다");
  const overlays = updateOverlayInLayers(timeline.overlays, clipId, (item) => {
    if ("durationSec" in item) return edge === "start" ? { ...item, startSec: toSec, durationSec: end - toSec } : { ...item, durationSec: toSec - item.startSec };
    return edge === "start"
      ? { ...item, startSec: toSec, inStartSec: sourceAt(item, toSec - item.startSec) }
      : { ...item, inEndSec: sourceAt(item, toSec - item.startSec) };
  });
  const result = overlays.flat().find(c => c.id === clipId)!;
  requireFrames(result.startSec, overlayDuration(result));
  return { ...timeline, overlays };
}

export function splitOverlayClip(timeline: Timeline, clipId: string, atSec: number, ids: readonly [string, string] = [`${clipId}-a`, `${clipId}-b`]): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`overlay 클립을 찾을 수 없습니다: ${clipId}`);
  const clip = found.clip;
  const duration = overlayDuration(clip);
  const offset = atSec - clip.startSec;
  if (!(offset > 0 && offset < duration) || Math.round(atSec * 30) <= Math.round((atSec - offset) * 30) || Math.round(atSec * 30) >= Math.round((atSec - offset + duration) * 30)) throw new RangeError("자르기 위치는 겹친 영상 클립 안쪽이어야 합니다");
  const transitionSplit = clip.startTransition || clip.endTransition ? {
    left: { endTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
    right: { startTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
  } : { left: {}, right: {} };
  const pieces: [OverlayClip, OverlayClip] = "durationSec" in clip
    ? [{ ...clip, id: ids[0], durationSec: offset, ...transitionSplit.left }, { ...clip, id: ids[1], startSec: atSec, durationSec: duration - offset, ...transitionSplit.right }]
    : [{ ...clip, id: ids[0], inEndSec: sourceAt(clip, offset), ...transitionSplit.left }, { ...clip, id: ids[1], startSec: atSec, inStartSec: sourceAt(clip, offset), ...transitionSplit.right }];
  delete pieces[1].sceneIndex;
  const overlays = timeline.overlays.map((layer, index) => index === found.layer ? layer.flatMap((item) => item.id === clipId ? pieces : [item]) : layer);
  return { ...timeline, overlays };
}

export function deleteOverlayClip(timeline: Timeline, clipId: string): Timeline {
  if (!findOverlayInLayers(timeline.overlays, clipId)) throw new Error(`overlay 클립을 찾을 수 없습니다: ${clipId}`);
  return { ...timeline, overlays: removeOverlayFromLayers(timeline.overlays, clipId) };
}

function requireClip<T extends { id: string }>(clips: readonly T[], id: string, track: string): T {
  const clip = clips.find((item) => item.id === id);
  if (!clip) throw new Error(`${track} 클립을 찾을 수 없습니다: ${id}`);
  return clip;
}

export function splitVideoClip(timeline: Timeline, clipId: string, atSec: number, ids: readonly [string, string] = [`${clipId}-a`, `${clipId}-b`]): Timeline {
  const clip = requireClip(timeline.video, clipId, "video");
  const start = videoStartTimes(timeline)[clipId]!;
  const offset = atSec - start;
  const duration = clipDuration(clip);
  if (!(offset > 0 && offset < duration) || Math.round(atSec * 30) <= Math.round((atSec - offset) * 30) || Math.round(atSec * 30) >= Math.round((atSec - offset + duration) * 30)) throw new RangeError("자르기 위치는 클립 안쪽이어야 합니다");
  const transitionSplit = clip.startTransition || clip.endTransition ? {
    left: { endTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
    right: { startTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
  } : { left: {}, right: {} };
  const pieces: [VideoClip, VideoClip] = "durationSec" in clip
    ? [{ ...clip, id: ids[0], durationSec: offset, ...transitionSplit.left }, { ...clip, id: ids[1], durationSec: duration - offset, ...transitionSplit.right }]
    : [
        { ...clip, id: ids[0], inEndSec: sourceAt(clip, offset), ...transitionSplit.left },
        { ...clip, id: ids[1], inStartSec: sourceAt(clip, offset), ...transitionSplit.right },
      ];
  if (clip.kind === "meme" && pieces.some((piece) => "durationSec" in piece && (piece.durationSec < 0.5 || piece.durationSec > 4))) {
    throw new RangeError("짤 길이는 0.5~4초여야 합니다");
  }
  const video = timeline.video.flatMap((item) => item.id === clipId ? pieces : [item]);
  return { ...timeline, video };
}

export function trimVideoClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number, inputDurationSec?: number): Timeline {
  const clip = requireClip(timeline.video, clipId, "video");
  const start = videoStartTimes(timeline)[clipId]!;
  const duration = clipDuration(clip);
  const remaining = edge === "start" ? start + duration - toSec : toSec - start;
  if (!(remaining > 0) || Math.round((edge === "start" ? toSec : start) * 30) >= Math.round((edge === "start" ? start + duration : toSec) * 30)) throw new RangeError("트림 결과 길이는 0보다 커야 합니다");
  if ("durationSec" in clip) {
    if (clip.kind === "meme" && (remaining < 0.5 || remaining > 4)) throw new RangeError("짤 길이는 0.5~4초여야 합니다");
    const video = timeline.video.map((item) => item.id === clipId ? { ...clip, durationSec: remaining } : item);
    return { ...timeline, video };
  }
  if (inputDurationSec === undefined || !Number.isFinite(inputDurationSec) || inputDurationSec <= 0) throw new RangeError("영상 원본 길이가 필요합니다");
  const nextStart = edge === "start" ? sourceAt(clip, toSec - start) : clip.inStartSec;
  const nextEnd = edge === "end" ? sourceAt(clip, remaining) : clip.inEndSec;
  if (nextStart < 0 || nextEnd > inputDurationSec) throw new RangeError("영상 구간이 원본 길이를 넘습니다");
  if (nextStart < 0 || nextEnd <= nextStart) throw new RangeError("원본 구간이 올바르지 않습니다");
  return { ...timeline, video: timeline.video.map((item) => item.id === clipId ? { ...clip, inStartSec: nextStart, inEndSec: nextEnd } : item) };
}

export function moveVideoClip(timeline: Timeline, clipId: string, toIndex: number): Timeline {
  requireClip(timeline.video, clipId, "video");
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= timeline.video.length) throw new RangeError("이동 위치가 올바르지 않습니다");
  const video = [...timeline.video];
  const [clip] = video.splice(video.findIndex((item) => item.id === clipId), 1);
  video.splice(toIndex, 0, clip!);
  return { ...timeline, video };
}

export function deleteVideoClip(timeline: Timeline, clipId: string): Timeline {
  return deleteVideoSelection(timeline, [clipId]).timeline;
}

export function deleteVideoSelection(timeline: Timeline, selectedIds: readonly string[]): { timeline: Timeline; blocked: boolean } {
  const groupIds = new Set(selectedIds.flatMap((id) => {
    const clip = timeline.video.find((item) => item.id === id) ?? timeline.overlays.flat().find((item) => item.id === id);
    return clip?.groupId ? [clip.groupId] : [];
  }));
  const removed = new Set([
    ...selectedIds,
    ...timeline.video.filter((clip) => clip.groupId && groupIds.has(clip.groupId)).map((clip) => clip.id),
    ...timeline.overlays.flat().filter((clip) => clip.groupId && groupIds.has(clip.groupId)).map((clip) => clip.id),
  ]);
  const video = timeline.video.filter((clip) => !removed.has(clip.id));
  if (timeline.video.length > 0 && video.length === 0) return { timeline, blocked: true };
  return {
    timeline: {
      ...timeline,
      video,
      overlays: timeline.overlays.map((layer) => layer.filter((clip) => !removed.has(clip.id))).filter((layer) => layer.length > 0),
    },
    blocked: false,
  };
}

export function trimCaptionClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number): Timeline {
  const layer = captionLayersOf(timeline).find((item) => [...item.main, ...item.sub].some((clip) => clip.id === clipId));
  const row = layer?.main.some(clip => clip.id === clipId) ? "main" : "sub";
  const clips = layer ? layer[row] : timeline.captions;
  const clip = requireClip(clips, clipId, "caption");
  if (edge === "start" ? toSec <= clip.startSec : toSec >= clip.endSec) throw new RangeError("클립을 늘리는 트림은 지원하지 않습니다");
  const next = edge === "start" ? { ...clip, startSec: toSec } : { ...clip, endSec: toSec };
  if (next.startSec < 0 || next.endSec <= next.startSec) throw new RangeError("자막 구간이 올바르지 않습니다");
  return layer ? withCaptionLayers(timeline, captionLayersOf(timeline).map((item) => item.id === layer.id ? { ...item, [row]: item[row].map((current) => current.id === clipId ? next : current) } : item)) : { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

function captionRow(timeline: Timeline, clipId: string) {
  for (const layer of captionLayersOf(timeline)) {
    for (const row of ["main", "sub"] as const) {
      const clip = layer[row].find(item => item.id === clipId);
      if (clip) return { layer, row, clip };
    }
  }
  throw new Error(`caption 클립을 찾을 수 없습니다: ${clipId}`);
}

export function setCaptionRange(timeline: Timeline, clipId: string, startSec: number, endSec: number): Timeline {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) throw new RangeError("자막 시각은 유한한 수여야 합니다");
  const { layer, row, clip } = captionRow(timeline, clipId);
  const others = layer[row].filter(item => item.id !== clipId);
  const lower = Math.max(0, ...others.filter(item => item.startSec < clip.startSec).map(item => item.endSec));
  const upper = Math.min(projectDuration(timeline), ...others.filter(item => item.startSec >= clip.startSec).map(item => item.startSec));
  if (upper - lower < 0.1 - 1e-9) return timeline;
  const start = Math.max(lower, Math.min(upper - 0.1, startSec));
  const end = Math.max(start + 0.1, Math.min(upper, endSec));
  return withCaptionLayers(timeline, captionLayersOf(timeline).map(item => item.id === layer.id
    ? { ...item, [row]: item[row].map(current => current.id === clipId ? { ...current, startSec: start, endSec: end } : current) } : item));
}

export function splitCaptionClip(timeline: Timeline, clipId: string, atSec: number, ids: readonly [string, string] = [`${clipId}-a`, `${clipId}-b`]): Timeline {
  const { layer, row, clip } = captionRow(timeline, clipId);
  if (!(atSec > clip.startSec && atSec < clip.endSec)) throw new RangeError("자르기 위치는 자막 클립 안쪽이어야 합니다");
  const { sceneIndex: _sceneIndex, ...right } = clip;
  const pieces: TextClip[] = [{ ...clip, id: ids[0], endSec: atSec, ...(clip.style ? { style: { ...clip.style } } : {}) },
    { ...right, id: ids[1], startSec: atSec, ...(clip.style ? { style: { ...clip.style } } : {}) }];
  return withCaptionLayers(timeline, captionLayersOf(timeline).map(item => item.id === layer.id
    ? { ...item, [row]: item[row].flatMap(current => current.id === clipId ? pieces : [current]) } : item));
}

export function addCaptionClip(timeline: Timeline, layerId: string, row: "main" | "sub", startSec: number, maxSec = 3): Timeline | null {
  const layers = captionLayersOf(timeline);
  const layer = layers.find(item => item.id === layerId);
  if (!layer) throw new Error(`자막 레이어를 찾을 수 없습니다: ${layerId}`);
  if (!Number.isFinite(startSec) || !Number.isFinite(maxSec) || startSec < 0 || layer[row].some(c => c.startSec <= startSec && c.endSec > startSec)) return null;
  const endSec = Math.min(startSec + Math.min(3, maxSec), projectDuration(timeline), ...layer[row].filter(c => c.startSec > startSec).map(c => c.startSec));
  if (endSec - startSec < 0.3 - 1e-9) return null;
  const clip: TextClip = { id: `caption-${crypto.randomUUID()}`, startSec, endSec, text: "" };
  return withCaptionLayers(timeline, layers.map(item => item.id === layerId ? { ...item, [row]: [...item[row], clip].sort((a, b) => a.startSec - b.startSec) } : item));
}

export function moveCaptionClip(timeline: Timeline, clipId: string, startSec: number): Timeline {
  const layer = captionLayersOf(timeline).find((item) => [...item.main, ...item.sub].some((clip) => clip.id === clipId));
  const row = layer?.main.some(clip => clip.id === clipId) ? "main" : "sub";
  const clips = layer ? layer[row] : timeline.captions;
  const clip = requireClip(clips, clipId, "caption");
  if (startSec < 0) throw new RangeError("시작 시각은 0 이상이어야 합니다");
  const next = { ...clip, startSec, endSec: startSec + clip.endSec - clip.startSec };
  return layer ? withCaptionLayers(timeline, captionLayersOf(timeline).map((item) => item.id === layer.id ? { ...item, [row]: item[row].map((current) => current.id === clipId ? next : current) } : item)) : { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

export function trimAudioClip(clips: readonly AudioClip[], clipId: string, edge: "start" | "end", toSec: number, fileDurationSec: number): AudioClip[] {
  const clip = requireClip(clips, clipId, "audio");
  if (!Number.isFinite(fileDurationSec) || fileDurationSec <= 0) throw new RangeError("오디오 파일 길이가 필요합니다");
  const offset = toSec - clip.startSec;
  let next: AudioClip;
  if (edge === "start") {
    const delta = offset;
    next = { ...clip, startSec: toSec, inStartSec: sourceAt(clip, delta) };
  } else {
    next = { ...clip, inEndSec: sourceAt(clip, offset) };
  }
  if (next.startSec < 0 || next.inStartSec < 0 || next.inEndSec <= next.inStartSec || next.inEndSec > fileDurationSec) throw new RangeError("오디오 구간이 파일 길이를 넘거나 올바르지 않습니다");
  requireFrames(next.startSec, audioClipLength(next));
  return clips.map((item) => item.id === clipId ? next : item);
}

export function moveAudioClip(clips: readonly AudioClip[], clipId: string, startSec: number): AudioClip[] {
  const clip = requireClip(clips, clipId, "audio");
  if (startSec < 0) throw new RangeError("시작 시각은 0 이상이어야 합니다");
  return clips.map((item) => item.id === clipId ? { ...clip, startSec } : item);
}

export function deleteCaptionClip(clips: readonly TextClip[], clipId: string): TextClip[] {
  requireClip(clips, clipId, "caption");
  return clips.filter((clip) => clip.id !== clipId);
}

export function deleteAudioClip(clips: readonly AudioClip[], clipId: string): AudioClip[] {
  requireClip(clips, clipId, "audio");
  return clips.filter((clip) => clip.id !== clipId);
}


export function projectDuration(timeline: Timeline): number {
  return Math.max(videoDuration(timeline), ...captionLayersOf(timeline).flatMap(l => [...l.main, ...l.sub]).map(c => c.endSec), ...[...timeline.voice, ...timeline.sfx].map(c => c.startSec + audioClipLength(c)));
}

function requireFrames(start: number, length: number): void {
  if (!Number.isFinite(length) || Math.round((start + length) * 30) <= Math.round(start * 30)) throw new RangeError("클립 길이는 1프레임 이상이어야 합니다");
}

function clampTransitions<T extends VideoClip | OverlayClip>(clip: T, duration: number): T {
  const next = { ...clip };
  for (const edge of ["startTransition", "endTransition"] as const) {
    const effect = clip[edge];
    if (effect && effect.kind.kind !== "none") {
      if (duration / 2 < 0.1) delete next[edge];
      else next[edge] = { ...effect, durationSec: Math.min(effect.durationSec ?? 0.5, duration / 2) };
    }
  }
  return next;
}

function cropOverlay(clip: OverlayClip, startSec: number, length: number): OverlayClip {
  requireFrames(startSec, length);
  const next = "durationSec" in clip ? { ...clip, startSec, durationSec: length } : { ...clip, startSec, inEndSec: sourceAt(clip, length) };
  return clampTransitions(next, length);
}

export function setVideoClipSpeed(timeline: Timeline, clipId: string, speed: number): Timeline {
  Speed.parse(speed);
  const clip = requireClip(timeline.video, clipId, "video");
  if ("durationSec" in clip) throw new RangeError("영상 클립만 배속을 지원합니다");
  if (clipSpeed(clip) === speed) return timeline;
  const length = playLength(clip.inStartSec, clip.inEndSec, speed);
  requireFrames(videoStartTimes(timeline)[clipId]!, length);
  const next = { ...timeline, video: timeline.video.map(c => c.id === clipId ? clampTransitions({ ...clip, speed }, length) : c) };
  const end = videoDuration(next);
  return { ...next, overlays: next.overlays.map(layer => layer.map(c => {
    const duration = overlayDuration(c);
    if (c.startSec + duration <= end) return c;
    return cropOverlay(c, Math.max(0, end - duration), Math.min(end, duration));
  })) };
}

export function setOverlayClipSpeed(timeline: Timeline, clipId: string, speed: number): Timeline {
  Speed.parse(speed);
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found || !("inStartSec" in found.clip)) throw new RangeError("영상 클립만 배속을 지원합니다");
  if (clipSpeed(found.clip) === speed) return timeline;
  const clip = { ...found.clip, speed };
  const length = Math.min(overlayDuration(clip), videoDuration(timeline) - clip.startSec);
  const next = cropOverlay(clip, clip.startSec, length);
  return { ...timeline, overlays: updateOverlayInLayers(timeline.overlays, clipId, () => next) };
}

export function setAudioClipSpeed(timeline: Timeline, clipId: string, speed: number): Timeline {
  Speed.parse(speed);
  const clip = requireClip(timeline.voice, clipId, "voice");
  if (clipSpeed(clip) === speed) return timeline;
  requireFrames(clip.startSec, playLength(clip.inStartSec, clip.inEndSec, speed));
  return { ...timeline, voice: timeline.voice.map(c => c.id === clipId ? { ...clip, speed } : c) };
}
