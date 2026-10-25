export function decideNewLaneDrop(input: {
  kind: "meme" | "sfx";
  atSec: number;
  videoDurationSec: number;
  mediaDurationSec: number;
  trackCount: number;
}): { track: number; startSec: number; durationSec: number } | null {
  if (![input.atSec, input.videoDurationSec, input.mediaDurationSec, input.trackCount].every(Number.isFinite) || input.videoDurationSec < 0 || input.mediaDurationSec <= 0 || input.trackCount < 0) return null;
  if (input.kind === "meme") {
    const durationSec = Math.min(2, input.mediaDurationSec, input.videoDurationSec);
    return { track: Math.trunc(input.trackCount), startSec: Math.max(0, Math.min(input.atSec, input.videoDurationSec - durationSec)), durationSec };
  }
  return { track: Math.trunc(input.trackCount), startSec: Math.max(0, Math.min(input.atSec, input.videoDurationSec - input.mediaDurationSec)), durationSec: input.mediaDurationSec };
}
import { resolveVideoTrackAtPointer } from "./video-track-drop";

export interface PointerDropRect { left: number; top: number; right: number; bottom: number }

export function decidePointerDrag(input: { startX: number; startY: number; currentX: number; currentY: number }): { kind: "click" | "drag" } {
  const values = [input.startX, input.startY, input.currentX, input.currentY];
  if (!values.every(Number.isFinite)) return { kind: "click" };
  return Math.hypot(input.currentX - input.startX, input.currentY - input.startY) > 4 ? { kind: "drag" } : { kind: "click" };
}

export type PointerDropTarget = { kind: "timeline" | "preview"; atSec: number } | { kind: "none" };

export function resolvePointerDropTarget(input: {
  clientX: number; clientY: number; previewRect: PointerDropRect | null; timelineRect: PointerDropRect | null;
  gridLeft: number; scrollLeft: number; scaleWidth: number; playhead: number;
}): PointerDropTarget {
  const inside = (rect: PointerDropRect | null) => rect !== null && input.clientX >= rect.left && input.clientX < rect.right && input.clientY >= rect.top && input.clientY < rect.bottom;
  if (![input.clientX, input.clientY].every(Number.isFinite)) return { kind: "none" };
  if (inside(input.previewRect) && Number.isFinite(input.playhead)) return { kind: "preview", atSec: input.playhead };
  if (!inside(input.timelineRect) || ![input.gridLeft, input.scrollLeft, input.scaleWidth].every(Number.isFinite) || input.scaleWidth <= 0) return { kind: "none" };
  return { kind: "timeline", atSec: Math.max(0, (input.clientX - input.gridLeft + input.scrollLeft) / input.scaleWidth) };
}


export function resolveLibraryDropPosition(input: {
  pointerX: number; pointerY: number; gridLeft: number; gridTop: number;
  scrollLeft: number; scrollTop: number; scaleWidth: number; rows: readonly string[];
  rowHeight?: number;
}): { track: string | null; atSec: number } {
  const values = [input.pointerX, input.pointerY, input.gridLeft, input.gridTop, input.scrollLeft, input.scrollTop, input.scaleWidth];
  if (!values.every(Number.isFinite) || input.scaleWidth <= 0) return { track: null, atSec: 0 };
  return {
    track: resolveVideoTrackAtPointer(input.rows, input.pointerY, input.gridTop, input.scrollTop, input.rowHeight),
    atSec: Math.max(0, (input.pointerX - input.gridLeft + input.scrollLeft) / input.scaleWidth),
  };
}
