import type { Input, OverlayClip, Timeline, VideoClip } from "../schema";
import { clipDuration, overlayDuration, deleteVideoSelection, videoDuration, videoStartTimes, VIDEO_TRACK_REQUIRED_MESSAGE } from "./ops";
import { placeOverlayAtLayer, removeOverlayFromLayers } from "./overlay-layers";
import { moveOverlayClipToVideo1 } from "./video-track-edits";

export interface VideoClipRef { id: string; track: string }
export interface VideoGroupTarget { track: string; startSec: number }

function overlayTrackIndex(track: string): number | null {
  const match = /^video-([2-9]\d*)$/.exec(track);
  return match ? Number(match[1]) - 2 : null;
}

function idsOnTrack(timeline: Timeline, track: string): string[] {
  if (track === "video") return timeline.video.map((clip) => clip.id);
  const layerIndex = overlayTrackIndex(track);
  return layerIndex === null ? [] : timeline.overlays[layerIndex]?.map((clip) => clip.id) ?? [];
}

function findVideo(timeline: Timeline, id: string): VideoClip | undefined {
  return timeline.video.find((clip) => clip.id === id);
}

function findOverlay(timeline: Timeline, id: string): { clip: OverlayClip; layer: number } | undefined {
  for (let layer = 0; layer < timeline.overlays.length; layer++) {
    const clip = timeline.overlays[layer]?.find((item) => item.id === id);
    if (clip) return { clip, layer };
  }
  return undefined;
}

function groupMembers(timeline: Timeline, groupId: string): VideoClipRef[] {
  return [
    ...timeline.video.filter((clip) => clip.groupId === groupId).map((clip) => ({ id: clip.id, track: "video" })),
    ...timeline.overlays.flatMap((layer, index) => layer.filter((clip) => clip.groupId === groupId).map((clip) => ({ id: clip.id, track: `video-${index + 2}` }))),
  ];
}

export function selectVideoRange(timeline: Timeline, track: string, anchorId: string, targetId: string): VideoClipRef[] {
  const ids = idsOnTrack(timeline, track);
  const anchor = ids.indexOf(anchorId);
  const target = ids.indexOf(targetId);
  if (anchor < 0 || target < 0) return [];
  return ids.slice(Math.min(anchor, target), Math.max(anchor, target) + 1).map((id) => ({ id, track }));
}

export function canGroupVideoClips(timeline: Timeline, selected: readonly VideoClipRef[]): { ok: boolean; reason?: string } {
  if (selected.length < 2) return { ok: false, reason: "두 개 이상의 클립을 선택하세요." };
  const track = selected[0]!.track;
  if (selected.some((clip) => clip.track !== track)) return { ok: false, reason: "같은 영상 트랙의 클립만 묶을 수 있습니다." };
  const ids = idsOnTrack(timeline, track);
  const indices = selected.map(({ id }) => ids.indexOf(id));
  if (indices.some((index) => index < 0)) return { ok: false, reason: "선택한 클립이 영상 트랙에 없습니다." };
  if (new Set(selected.map(({ id }) => id)).size !== selected.length) return { ok: false, reason: "같은 클립을 두 번 선택할 수 없습니다." };
  const ordered = [...indices].sort((a, b) => a - b);
  if (ordered.at(-1)! - ordered[0]! + 1 !== ordered.length) return { ok: false, reason: "이웃하지 않은 클립은 묶을 수 없습니다." };
  if (selected.some(({ id }) => (findVideo(timeline, id) ?? findOverlay(timeline, id)?.clip)?.groupId)) return { ok: false, reason: "이미 묶인 클립은 새 묶음에 넣을 수 없습니다." };
  return { ok: true };
}

export function groupVideoClips(timeline: Timeline, selected: readonly VideoClipRef[], groupId: string): Timeline {
  const result = canGroupVideoClips(timeline, selected);
  if (!result.ok) throw new RangeError(result.reason);
  if (!groupId.trim()) throw new RangeError("묶음 id가 필요합니다.");
  const ids = new Set(selected.map(({ id }) => id));
  return {
    ...timeline,
    video: timeline.video.map((clip) => ids.has(clip.id) ? { ...clip, groupId } : clip),
    overlays: timeline.overlays.map((layer) => layer.map((clip) => ids.has(clip.id) ? { ...clip, groupId } : clip)),
  };
}

export function ungroupVideoClips(timeline: Timeline, selectedIds: readonly string[]): Timeline {
  const groupIds = new Set(selectedIds.flatMap((id) => {
    const clip = findVideo(timeline, id) ?? findOverlay(timeline, id)?.clip;
    return clip?.groupId ? [clip.groupId] : [];
  }));
  if (!groupIds.size) return timeline;
  const ungroup = <T extends { groupId?: string }>(clip: T): T => {
    if (!clip.groupId || !groupIds.has(clip.groupId)) return clip;
    const { groupId: _groupId, ...rest } = clip;
    return rest as T;
  };
  return { ...timeline, video: timeline.video.map(ungroup), overlays: timeline.overlays.map((layer) => layer.map(ungroup)) };
}

export function deleteVideoGroup(timeline: Timeline, groupId: string): Timeline {
  if (!groupMembers(timeline, groupId).length) throw new Error(`묶음을 찾을 수 없습니다: ${groupId}`);
  const result = deleteVideoSelection(timeline, groupMembers(timeline, groupId).map(({ id }) => id));
  if (result.blocked) throw new Error(VIDEO_TRACK_REQUIRED_MESSAGE);
  return result.timeline;
}

function videoToOverlay(clip: VideoClip, startSec: number, inputs: readonly Input[]): OverlayClip {
  const common = {
    ...(clip.speed !== undefined ? { speed: clip.speed } : {}),
    id: clip.id, startSec, x: 0.5, y: 0.5, width: 0.6,
    ...(clip.groupId ? { groupId: clip.groupId } : {}),
    ...(clip.startTransition ? { startTransition: clip.startTransition } : {}),
    ...(clip.endTransition ? { endTransition: clip.endTransition } : {}),
  };
  if (clip.kind === "meme") return { ...common, memeId: clip.memeId, durationSec: clip.durationSec };
  const input = inputs.find((item) => item.id === clip.inputId);
  if (input?.kind === "photo" || "durationSec" in clip) return { ...common, kind: "photo", inputId: clip.inputId, durationSec: "durationSec" in clip ? clip.durationSec : input?.durationSec ?? 3 };
  return { ...common, kind: "video", inputId: clip.inputId, inStartSec: clip.inStartSec, inEndSec: clip.inEndSec };
}

function overlayToVideo(clip: OverlayClip): VideoClip {
  const common = {
    ...(clip.speed !== undefined ? { speed: clip.speed } : {}),
    id: clip.id,
    ...(clip.groupId ? { groupId: clip.groupId } : {}),
    ...(clip.startTransition ? { startTransition: clip.startTransition } : {}),
    ...(clip.endTransition ? { endTransition: clip.endTransition } : {}),
  };
  if ("memeId" in clip) return { ...common, kind: "meme", memeId: clip.memeId, durationSec: clip.durationSec };
  if (clip.kind === "video") return { ...common, kind: "main", inputId: clip.inputId, inStartSec: clip.inStartSec, inEndSec: clip.inEndSec };
  return { ...common, kind: "main", inputId: clip.inputId, durationSec: clip.durationSec };
}

export function moveVideoGroup(timeline: Timeline, groupId: string, target: VideoGroupTarget, inputs: readonly Input[] = []): Timeline {
  const refs = groupMembers(timeline, groupId);
  if (!refs.length) throw new Error(`묶음을 찾을 수 없습니다: ${groupId}`);
  if (!Number.isFinite(target.startSec) || target.startSec < 0) throw new RangeError("이동 시각이 올바르지 않습니다.");
  const sourceTrack = refs[0]!.track;
  if (refs.some((ref) => ref.track !== sourceTrack)) throw new Error("묶음의 클립이 여러 트랙에 나뉘어 있습니다.");

  if (sourceTrack === "video" && target.track === "video") {
    const starts = videoStartTimes(timeline);
    const moved = refs.map(({ id }) => timeline.video.find((clip) => clip.id === id)!).sort((a, b) => starts[a.id]! - starts[b.id]!);
    const remaining = timeline.video.filter((clip) => clip.groupId !== groupId);
    let insertAt = 0;
    let elapsed = 0;
    while (insertAt < remaining.length && elapsed + clipDuration(remaining[insertAt]!) / 2 <= target.startSec) {
      elapsed += clipDuration(remaining[insertAt]!);
      insertAt++;
    }
    return { ...timeline, video: [...remaining.slice(0, insertAt), ...moved, ...remaining.slice(insertAt)] };
  }

  const targetLayer = target.track === "video-new" ? timeline.overlays.length : overlayTrackIndex(target.track);
  if (targetLayer === null) throw new RangeError("이동할 영상 트랙이 아닙니다.");
  const videoMembers = refs.map(({ id }) => timeline.video.find((clip) => clip.id === id)).filter((clip): clip is VideoClip => Boolean(clip));
  const overlayMembers = refs.map(({ id }) => findOverlay(timeline, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (sourceTrack === "video") {
    if (target.track === "video") return timeline;
    if (timeline.video.length - videoMembers.length < 1) throw new Error(VIDEO_TRACK_REQUIRED_MESSAGE);
    const starts = videoStartTimes(timeline);
    const moved = videoMembers.map((clip) => videoToOverlay(clip, starts[clip.id]!, inputs));
    let overlays = timeline.overlays;
    for (const clip of moved) {
      const layer = overlays[targetLayer];
      if (layer?.some((item) => item.startSec < clip.startSec + overlayDuration(clip) && item.startSec + overlayDuration(item) > clip.startSec)) {
        throw new RangeError("묶음 클립이 대상 영상 트랙의 다른 클립과 겹칩니다.");
      }
      overlays = placeOverlayAtLayer(overlays, clip, targetLayer);
    }
    const ids = new Set(videoMembers.map((clip) => clip.id));
    return { ...timeline, video: timeline.video.filter((clip) => !ids.has(clip.id)), overlays };
  }

  if (target.track === "video") {
    const ordered = overlayMembers.map(({ clip }) => clip).sort((a, b) => a.startSec - b.startSec);
    let next = timeline;
    let insertAt = target.startSec;
    for (let index = 0; index < ordered.length; index++) {
      const clip = ordered[index]!;
      next = moveOverlayClipToVideo1(next, clip.id, insertAt, [`${groupId}-split-${index}-a`, `${groupId}-split-${index}-b`]);
      next = { ...next, video: next.video.map((item) => item.id === clip.id ? overlayToVideo(clip) : item) };
      insertAt += overlayDuration(clip);
    }
    return next;
  }

  const firstStart = Math.min(...overlayMembers.map(({ clip }) => clip.startSec));
  const delta = sourceTrack === target.track ? target.startSec - firstStart : 0;
  const duration = overlayDuration;
  const videoLength = videoDuration(timeline);
  const moved = overlayMembers.map(({ clip }) => ({ ...clip, startSec: clip.startSec + delta }));
  if (moved.some((clip) => clip.startSec < 0 || clip.startSec + duration(clip) > videoLength)) throw new RangeError("묶음은 본 영상 길이 안에서 이동해야 합니다.");
  const ids = new Set(moved.map((clip) => clip.id));
  let overlays = timeline.overlays.map((layer) => layer.filter((clip) => !ids.has(clip.id))).filter((layer) => layer.length > 0);
  for (const clip of moved) {
    const layer = overlays[targetLayer];
    if (layer?.some((item) => item.startSec < clip.startSec + duration(clip) && item.startSec + duration(item) > clip.startSec)) {
      throw new RangeError("묶음 클립이 대상 영상 트랙의 다른 클립과 겹칩니다.");
    }
    overlays = placeOverlayAtLayer(overlays, clip, targetLayer);
  }
  return { ...timeline, overlays };
}
