export const TRACK_ROW_HEIGHT = 28;
export const TIMELINE_RULER_HEIGHT = 42;
export const TIMELINE_ACTION_INSET = 2;

export function timelineActionHeight(): number {
  return TRACK_ROW_HEIGHT - TIMELINE_ACTION_INSET * 2;
}

export function timelineEditorHeight(trackCount: number): number {
  return TIMELINE_RULER_HEIGHT + Math.max(0, Math.floor(trackCount)) * TRACK_ROW_HEIGHT;
}
