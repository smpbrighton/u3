const VIDEO_TRACK = /^(?:video|video-(?:[2-9]|[1-9]\d+)|video-new)$/;

export type ActionMoveDecision =
  | { kind: "reset" }
  | { kind: "move-group"; targetTrack: string }
  | { kind: "video1-to-overlay"; targetTrack: string }
  | { kind: "overlay-to-video1" }
  | { kind: "overlay-to-overlay"; targetTrack: string }
  | { kind: "reorder-video1" }
  | { kind: "move-overlay" }
  | { kind: "move-caption" }
  | { kind: "move-audio"; track: "voice" | "sfx" }
  | { kind: "ignore" };

export interface ActionMoveInput {
  dragSourceTrack: string | null;
  editorRow: string;
  targetRow: string | null;
  sourceStart: number;
  start: number;
  groupId?: string;
}

export const VIDEO_TRACK_EDIT_GRID_SELECTOR = ".timeline-editor-edit-area .ReactVirtualized__Grid";

export function isSameTrackDropPosition(sourceTrack: string, targetTrack: string, sourceStart: number, targetStart: number): boolean {
  return sourceTrack === targetTrack && Math.abs(sourceStart - targetStart) < 1e-6;
}

export function decideActionMove(input: ActionMoveInput): ActionMoveDecision {
  const { dragSourceTrack, editorRow, targetRow, sourceStart, start, groupId } = input;
  if (dragSourceTrack && VIDEO_TRACK.test(dragSourceTrack)) {
    const targetTrack = targetRow ?? dragSourceTrack;
    if (isSameTrackDropPosition(dragSourceTrack, targetTrack, sourceStart, start)) return { kind: "reset" };
    if (groupId) return { kind: "move-group", targetTrack };
    if (dragSourceTrack === "video" && targetTrack !== "video") return { kind: "video1-to-overlay", targetTrack };
    if (dragSourceTrack !== "video" && targetTrack === "video") return { kind: "overlay-to-video1" };
    if (dragSourceTrack !== "video" && targetTrack !== dragSourceTrack) return { kind: "overlay-to-overlay", targetTrack };
    return dragSourceTrack === "video" ? { kind: "reorder-video1" } : { kind: "move-overlay" };
  }
  if (editorRow === "video") return { kind: "reorder-video1" };
  if (/^video-(?:[2-9]|[1-9]\d+)$/.test(editorRow)) return { kind: "move-overlay" };
  if (editorRow === "captions") return { kind: "move-caption" };
  if (editorRow === "voice") return { kind: "move-audio", track: "voice" };
  if (editorRow === "sfx" || /^sfx-\d+$/.test(editorRow)) return { kind: "move-audio", track: "sfx" };
  return { kind: "ignore" };
}

export function shouldResetNewTrackDrop(input: { overlayCount: number; sourceTrack: string; sourceClipCount: number }): boolean {
  return input.overlayCount > 0 && input.sourceTrack === `video-${input.overlayCount + 1}` && input.sourceClipCount === 1;
}

export function isUnchangedTimeline(current: unknown, next: unknown): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function resolveVideoTrackAtPointer(
  rows: readonly string[],
  pointerY: number,
  gridTop: number,
  scrollTop: number,
  rowHeight = 28,
): string | null {
  if (![pointerY, gridTop, scrollTop, rowHeight].every(Number.isFinite) || rowHeight <= 0) return null;
  const index = Math.floor((pointerY - gridTop + scrollTop) / rowHeight);
  const row = rows[index];
  return row && VIDEO_TRACK.test(row) ? row : null;
}
