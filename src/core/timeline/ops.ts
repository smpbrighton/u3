import type { AudioClip, OverlayClip, TextClip, Timeline, VideoClip } from "../schema";
import { findOverlayInLayers, removeOverlayFromLayers, updateOverlayInLayers } from "./overlay-layers";

export function clipDuration(clip: VideoClip): number {
  return "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
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
  return "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
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
      ? { ...item, startSec: toSec, inStartSec: item.inStartSec + toSec - item.startSec }
      : { ...item, inEndSec: item.inStartSec + toSec - item.startSec };
  });
  return { ...timeline, overlays };
}

export function splitOverlayClip(timeline: Timeline, clipId: string, atSec: number, ids: readonly [string, string] = [`${clipId}-a`, `${clipId}-b`]): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`overlay 클립을 찾을 수 없습니다: ${clipId}`);
  const clip = found.clip;
  const duration = overlayDuration(clip);
  const offset = atSec - clip.startSec;
  if (!(offset > 0 && offset < duration)) throw new RangeError("자르기 위치는 겹친 영상 클립 안쪽이어야 합니다");
  const transitionSplit = clip.startTransition || clip.endTransition ? {
    left: { endTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
    right: { startTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
  } : { left: {}, right: {} };
  const pieces: [OverlayClip, OverlayClip] = "durationSec" in clip
    ? [{ ...clip, id: ids[0], durationSec: offset, ...transitionSplit.left }, { ...clip, id: ids[1], startSec: atSec, durationSec: duration - offset, ...transitionSplit.right }]
    : [{ ...clip, id: ids[0], inEndSec: clip.inStartSec + offset, ...transitionSplit.left }, { ...clip, id: ids[1], startSec: atSec, inStartSec: clip.inStartSec + offset, ...transitionSplit.right }];
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
  if (!(offset > 0 && offset < duration)) throw new RangeError("자르기 위치는 클립 안쪽이어야 합니다");
  const transitionSplit = clip.startTransition || clip.endTransition ? {
    left: { endTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
    right: { startTransition: { kind: { kind: "none" as const }, durationSec: 0.5 } },
  } : { left: {}, right: {} };
  const pieces: [VideoClip, VideoClip] = "durationSec" in clip
    ? [{ ...clip, id: ids[0], durationSec: offset, ...transitionSplit.left }, { ...clip, id: ids[1], durationSec: duration - offset, ...transitionSplit.right }]
    : [
        { ...clip, id: ids[0], inEndSec: clip.inStartSec + offset, ...transitionSplit.left },
        { ...clip, id: ids[1], inStartSec: clip.inStartSec + offset, ...transitionSplit.right },
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
  if (!(remaining > 0)) throw new RangeError("트림 결과 길이는 0보다 커야 합니다");
  if ("durationSec" in clip) {
    if (clip.kind === "meme" && (remaining < 0.5 || remaining > 4)) throw new RangeError("짤 길이는 0.5~4초여야 합니다");
    const video = timeline.video.map((item) => item.id === clipId ? { ...clip, durationSec: remaining } : item);
    return { ...timeline, video };
  }
  if (inputDurationSec === undefined || !Number.isFinite(inputDurationSec) || inputDurationSec <= 0) throw new RangeError("영상 원본 길이가 필요합니다");
  const nextStart = edge === "start" ? clip.inStartSec + (toSec - start) : clip.inStartSec;
  const nextEnd = edge === "end" ? clip.inStartSec + remaining : clip.inEndSec;
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
  requireClip(timeline.video, clipId, "video");
  return { ...timeline, video: timeline.video.filter((clip) => clip.id !== clipId) };
}

export function trimCaptionClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number): Timeline {
  const clip = requireClip(timeline.captions, clipId, "caption");
  if (edge === "start" ? toSec <= clip.startSec : toSec >= clip.endSec) throw new RangeError("클립을 늘리는 트림은 지원하지 않습니다");
  const next = edge === "start" ? { ...clip, startSec: toSec } : { ...clip, endSec: toSec };
  if (next.startSec < 0 || next.endSec <= next.startSec) throw new RangeError("자막 구간이 올바르지 않습니다");
  return { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

export function moveCaptionClip(timeline: Timeline, clipId: string, startSec: number): Timeline {
  const clip = requireClip(timeline.captions, clipId, "caption");
  if (startSec < 0) throw new RangeError("시작 시각은 0 이상이어야 합니다");
  const next = { ...clip, startSec, endSec: startSec + clip.endSec - clip.startSec };
  return { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

export function trimAudioClip(clips: readonly AudioClip[], clipId: string, edge: "start" | "end", toSec: number, fileDurationSec: number): AudioClip[] {
  const clip = requireClip(clips, clipId, "audio");
  if (!Number.isFinite(fileDurationSec) || fileDurationSec <= 0) throw new RangeError("오디오 파일 길이가 필요합니다");
  const duration = clip.inEndSec - clip.inStartSec;
  const offset = toSec - clip.startSec;
  let next: AudioClip;
  if (edge === "start") {
    const delta = offset;
    next = { ...clip, startSec: toSec, inStartSec: clip.inStartSec + delta };
  } else {
    next = { ...clip, inEndSec: clip.inStartSec + offset };
  }
  if (next.startSec < 0 || next.inStartSec < 0 || next.inEndSec <= next.inStartSec || next.inEndSec > fileDurationSec) throw new RangeError("오디오 구간이 파일 길이를 넘거나 올바르지 않습니다");
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
