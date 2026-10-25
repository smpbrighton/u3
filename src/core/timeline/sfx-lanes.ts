import type { AudioClip } from "../schema";

export function sfxLane(clip: AudioClip): number {
  return clip.lane ?? 0;
}

export function sfxRowId(lane: number, lanes: readonly number[]): string {
  const ordered = [...new Set([0, ...lanes])].sort((a, b) => a - b);
  const index = ordered.indexOf(lane);
  return index <= 0 ? "sfx" : `sfx-${index + 1}`;
}

export function audioGroupForRow(rowId: string): "source" | "voice" | "sfx" | "stem-voice" | "stem-bg" | null {
  if (rowId === "source" || rowId === "voice" || rowId === "sfx" || rowId === "stem-voice" || rowId === "stem-bg") return rowId;
  return /^sfx-\d+$/.test(rowId) ? "sfx" : null;
}

export function nextSfxLane(clips: readonly AudioClip[]): number {
  return clips.reduce((highest, clip) => Math.max(highest, sfxLane(clip)), -1) + 1;
}

export function normalizeSfxLanes(clips: readonly AudioClip[]): AudioClip[] {
  const lanes = [...new Set(clips.map(sfxLane))].sort((a, b) => a - b);
  const compact = new Map(lanes.map((lane, index) => [lane, index]));
  return clips.map((clip) => ({ ...clip, lane: compact.get(sfxLane(clip)) ?? 0 }));
}
