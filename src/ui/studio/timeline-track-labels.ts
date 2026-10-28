import { TRACK_ROW_HEIGHT } from "./timeline-layout";

export interface TimelineTrackLabelInput {
  id: string;
  name?: string;
}

export interface TimelineTrackLabel extends TimelineTrackLabelInput {
  name: string;
  color: string;
}

export function withNewVideoTrackRow<T extends { id: string; name?: string; actions: unknown[]; rowHeight: number }>(rows: readonly T[]): (T | { id: string; name: string; actions: never[]; rowHeight: number })[] {
  let insertAt = -1;
  rows.forEach((row, index) => {
    if (row.id === "captions" || /-(?:main|sub)$/.test(row.id)) insertAt = index + 1;
  });
  const placeholder = { id: "video-new", name: "새 영상 트랙", actions: [], rowHeight: TRACK_ROW_HEIGHT };
  return [...rows.slice(0, insertAt < 0 ? 0 : insertAt), placeholder, ...rows.slice(insertAt < 0 ? 0 : insertAt)];
}

const DEFAULT_TRACKS: Record<string, { name: string; color: string }> = {
  captions: { name: "자막", color: "var(--u3-clip-caption)" },
  video: { name: "영상 1", color: "var(--u3-clip-video)" },
  source: { name: "원본 소리", color: "var(--u3-clip-audio)" },
  "stem-voice": { name: "목소리", color: "var(--u3-clip-audio)" },
  "stem-bg": { name: "배경", color: "var(--u3-clip-audio)" },
  voice: { name: "음성", color: "var(--u3-clip-voice)" },
  sfx: { name: "효과음", color: "var(--u3-clip-sfx)" },
};

function colorForTrack(id: string): string {
  if (id === "video-new" || /^video-\d+$/.test(id)) return "var(--u3-clip-meme)";
  if (id === "captions" || /-(?:main|sub)$/.test(id)) return "var(--u3-clip-caption)";
  if (/^sfx(?:-\d+)?$/.test(id)) return "var(--u3-clip-sfx)";
  return DEFAULT_TRACKS[id]?.color ?? "var(--muted)";
}

export function timelineTrackLabels<T extends TimelineTrackLabelInput>(rows: readonly T[]): (T & TimelineTrackLabel)[] {
  return rows.map((row) => ({
    ...row,
    name: row.name ?? DEFAULT_TRACKS[row.id]?.name ?? row.id,
    color: colorForTrack(row.id),
  }));
}

