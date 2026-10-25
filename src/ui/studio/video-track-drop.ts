const VIDEO_TRACK = /^(?:video|video-[2-9]\d*|video-new)$/;

export const VIDEO_TRACK_EDIT_GRID_SELECTOR = ".timeline-editor-edit-area .ReactVirtualized__Grid";

export function isSameTrackDropPosition(sourceTrack: string, targetTrack: string, sourceStart: number, targetStart: number): boolean {
  return sourceTrack === targetTrack && Math.abs(sourceStart - targetStart) < 1e-6;
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
