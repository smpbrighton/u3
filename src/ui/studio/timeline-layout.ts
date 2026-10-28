export const TRACK_ROW_HEIGHT = 28;
export const TIMELINE_RULER_HEIGHT = 42;
export const TIMELINE_ACTION_INSET = 2;

/** 트랙 머리의 고정 항목과 이름이 차지하는 폭. 현재 화면의 치수를 옮긴다. */
export function timelineTrackHeaderLayout(name: string, audio: boolean, voice: boolean) {
  const width = 112;
  const padding = 21;
  const muteWidth = audio ? 24 : 0;
  const generateWidth = voice ? 64 : 0;
  const gaps = (Number(audio) + Number(voice)) * 4;
  const nameWidth = Math.min(name.length * 12, 48);
  return { width, padding, muteWidth, generateWidth, gaps, nameWidth,
    contentWidth: padding + nameWidth + muteWidth + generateWidth + gaps };
}

export function timelineActionHeight(): number {
  return TRACK_ROW_HEIGHT - TIMELINE_ACTION_INSET * 2;
}

export function timelineEditorHeight(trackCount: number): number {
  return TIMELINE_RULER_HEIGHT + Math.max(0, Math.floor(trackCount)) * TRACK_ROW_HEIGHT;
}
