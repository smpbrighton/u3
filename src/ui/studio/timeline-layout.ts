export const TRACK_ROW_HEIGHT = 28;
export const TIMELINE_RULER_HEIGHT = 42;
export const TIMELINE_ACTION_INSET = 2;

/** TrackHeader의 고정 칸을 먼저 확보하고 이름은 남은 폭 안에서 줄인다. */
export function timelineTrackHeaderLayout(name: string, audio: boolean, _voice: boolean) {
  const width = 120;
  const padding = 16;
  const muteWidth = audio ? 24 : 0;
  const generateWidth = 0;
  const gaps = audio ? 6 : 0;
  const nameWidth = Math.min(name.length * 12, width - padding - muteWidth - gaps);
  return { width, padding, muteWidth, generateWidth, gaps, nameWidth,
    contentWidth: padding + nameWidth + muteWidth + generateWidth + gaps };
}

export function timelineActionHeight(): number {
  return TRACK_ROW_HEIGHT - TIMELINE_ACTION_INSET * 2;
}

export function timelineEditorHeight(trackCount: number): number {
  return TIMELINE_RULER_HEIGHT + Math.min(10, Math.max(0, Math.floor(trackCount))) * TRACK_ROW_HEIGHT;
}
