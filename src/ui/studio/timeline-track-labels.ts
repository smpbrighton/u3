export interface TimelineTrackLabelInput {
  id: string;
  name?: string;
}

export interface TimelineTrackLabel extends TimelineTrackLabelInput {
  name: string;
  color: string;
}

const DEFAULT_TRACKS: Record<string, { name: string; color: string }> = {
  captions: { name: "자막", color: "#F7A54A" },
  video: { name: "영상 1", color: "#608CF5" },
  source: { name: "원본 소리", color: "#56B981" },
  "stem-voice": { name: "목소리", color: "#24A872" },
  "stem-bg": { name: "배경", color: "#6FAF8A" },
  voice: { name: "음성", color: "#9673DD" },
  sfx: { name: "효과음", color: "#E276A7" },
};

function colorForTrack(id: string): string {
  if (id === "video-new" || /^video-\d+$/.test(id)) return "#A875D6";
  if (id === "captions" || /-(?:main|sub)$/.test(id)) return "#F7A54A";
  if (/^sfx(?:-\d+)?$/.test(id)) return "#E276A7";
  return DEFAULT_TRACKS[id]?.color ?? "#8A929E";
}

export function timelineTrackLabels<T extends TimelineTrackLabelInput>(rows: readonly T[]): (T & TimelineTrackLabel)[] {
  return rows.map((row) => ({
    ...row,
    name: row.name ?? DEFAULT_TRACKS[row.id]?.name ?? row.id,
    color: colorForTrack(row.id),
  }));
}
