import type { Timeline } from "../schema";
import { clipDuration, overlayDuration, videoStartTimes } from "./ops";

export interface VideoPointerTarget {
  id: string;
  atSec: number;
}

/** 타임라인 좌표에서 실제 영상 클립과 안전한 자르기 시각을 찾는다. */
export function findVideoClipAtTime(timeline: Timeline, track: string, atSec: number, edgeMarginSec = 0.1): VideoPointerTarget | null {
  if (!Number.isFinite(atSec) || !Number.isFinite(edgeMarginSec) || edgeMarginSec < 0) return null;
  if (track === "video") {
    const starts = videoStartTimes(timeline);
    const clip = timeline.video.find((item) => {
      const start = starts[item.id]!;
      const end = start + clipDuration(item);
      return atSec >= start && atSec < end && atSec - start > edgeMarginSec + 1e-9 && end - atSec > edgeMarginSec + 1e-9;
    });
    return clip ? { id: clip.id, atSec } : null;
  }
  const match = /^video-([2-9]\d*)$/.exec(track);
  if (!match) return null;
  const layer = timeline.overlays[Number(match[1]) - 2];
  const clip = layer?.find((item) => atSec >= item.startSec && atSec < item.startSec + overlayDuration(item)
    && atSec - item.startSec > edgeMarginSec + 1e-9
    && item.startSec + overlayDuration(item) - atSec > edgeMarginSec + 1e-9);
  return clip ? { id: clip.id, atSec } : null;
}
