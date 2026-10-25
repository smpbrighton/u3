const VIDEO_TRACK = /^(?:video|video-[2-9]\d*|video-new)$/;

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
