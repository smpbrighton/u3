import type { Input, OverlayClip, Timeline, VideoClip } from "../schema";
import { clipDuration, videoStartTimes } from "./ops";
import { findOverlayInLayers, placeOverlayAtLayer, placeOverlayInLowestLayer, removeOverlayFromLayers } from "./overlay-layers";

const overlayDuration = (clip: OverlayClip) => "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
const overlayBox = { x: 0.5, y: 0.5, width: 0.6 };

function videoClipToOverlay(clip: VideoClip, startSec: number, inputs: readonly Input[]): OverlayClip {
  if (clip.kind === "meme") return { id: clip.id, memeId: clip.memeId, startSec, durationSec: clip.durationSec, ...overlayBox };
  const input = inputs.find((item) => item.id === clip.inputId);
  if (input?.kind === "photo" || "durationSec" in clip) return { id: clip.id, kind: "photo", inputId: clip.inputId, startSec, durationSec: "durationSec" in clip ? clip.durationSec : input?.durationSec ?? 3, ...overlayBox };
  return { id: clip.id, kind: "video", inputId: clip.inputId, startSec, inStartSec: clip.inStartSec, inEndSec: clip.inEndSec, ...overlayBox };
}

export function moveVideo1ClipToOverlay(timeline: Timeline, clipId: string, inputs: readonly Input[], targetLayer?: number): Timeline {
  if (timeline.video.length <= 1) throw new Error("영상 1에는 클립이 하나 이상 있어야 합니다");
  const starts = videoStartTimes(timeline);
  const clip = timeline.video.find((item) => item.id === clipId);
  if (!clip) throw new Error(`영상 1 클립을 찾을 수 없습니다: ${clipId}`);
  const overlay = videoClipToOverlay(clip, starts[clip.id]!, inputs);
  const overlays = targetLayer === undefined ? placeOverlayInLowestLayer(timeline.overlays, overlay) : placeOverlayAtLayer(timeline.overlays, overlay, targetLayer);
  return { ...timeline, video: timeline.video.filter((item) => item.id !== clipId), overlays };
}

export function moveOverlayClipToLayer(timeline: Timeline, clipId: string, targetLayer: number): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`겹친 영상 클립을 찾을 수 없습니다: ${clipId}`);
  if (found.layer === targetLayer) return timeline;
  const overlays = removeOverlayFromLayers(timeline.overlays, clipId);
  const adjustedTarget = found.layer < targetLayer ? targetLayer - 1 : targetLayer;
  return { ...timeline, overlays: placeOverlayAtLayer(overlays, found.clip, adjustedTarget) };
}

export function moveOverlayClipToVideo1(timeline: Timeline, clipId: string, atSec: number, splitIds: [string, string]): Timeline {
  const found = findOverlayInLayers(timeline.overlays, clipId);
  if (!found) throw new Error(`겹친 영상 클립을 찾을 수 없습니다: ${clipId}`);
  const clip = found.clip;
  const duration = overlayDuration(clip);
  const at = Math.max(0, atSec);
  const insert = (): VideoClip => "memeId" in clip
    ? { id: clip.id, kind: "meme", memeId: clip.memeId, durationSec: duration }
    : clip.kind === "video"
      ? { id: clip.id, kind: "main", inputId: clip.inputId, inStartSec: clip.inStartSec, inEndSec: clip.inEndSec }
      : { id: clip.id, kind: "main", inputId: clip.inputId, durationSec: duration };
  const video: VideoClip[] = [];
  const starts = videoStartTimes(timeline);
  let inserted = false;
  for (const existing of timeline.video) {
    const start = starts[existing.id]!;
    const end = start + clipDuration(existing);
    if (!inserted && at > start && at < end) {
      if (existing.kind === "main" && "inStartSec" in existing) {
        const offset = at - start;
        video.push({ ...existing, id: splitIds[0], inEndSec: existing.inStartSec + offset });
        video.push(insert());
        video.push({ ...existing, id: splitIds[1], inStartSec: existing.inStartSec + offset });
      } else if (existing.kind === "meme") {
        const offset = at - start;
        video.push({ ...existing, id: splitIds[0], durationSec: offset });
        video.push(insert());
        video.push({ ...existing, id: splitIds[1], durationSec: existing.durationSec - offset });
      } else {
        const offset = at - start;
        video.push({ ...existing, id: splitIds[0], durationSec: offset });
        video.push(insert());
        video.push({ ...existing, id: splitIds[1], durationSec: existing.durationSec - offset });
      }
      inserted = true;
    } else {
      if (!inserted && at <= start) { video.push(insert()); inserted = true; }
      video.push(existing);
    }
  }
  if (!inserted) video.push(insert());
  return { ...timeline, video, overlays: removeOverlayFromLayers(timeline.overlays, clipId) };
}
