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
