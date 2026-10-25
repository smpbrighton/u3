import type { AudioClip } from "../schema";

export function sfxLane(clip: AudioClip): number {
  return clip.lane ?? 0;
}

export function nextSfxLane(clips: readonly AudioClip[]): number {
  return clips.reduce((highest, clip) => Math.max(highest, sfxLane(clip)), -1) + 1;
}

export function normalizeSfxLanes(clips: readonly AudioClip[]): AudioClip[] {
  const lanes = [...new Set(clips.map(sfxLane))].sort((a, b) => a - b);
  const compact = new Map(lanes.map((lane, index) => [lane, index]));
  return clips.map((clip) => ({ ...clip, lane: compact.get(sfxLane(clip)) ?? 0 }));
}
