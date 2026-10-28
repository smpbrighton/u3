import type { AudioCacheEntry } from "../schema";

export const clipSpeed = (clip: { speed?: number }): number => clip.speed ?? 1;
export const playLength = (inStart: number, inEnd: number, speed = 1): number => (inEnd - inStart) / speed;
export const sourceAt = (clip: { inStartSec: number; speed?: number }, timelineOffset: number): number => clip.inStartSec + timelineOffset * clipSpeed(clip);
export const timelineOffsetOf = (clip: { inStartSec: number; speed?: number }, sourceSec: number): number => (sourceSec - clip.inStartSec) / clipSpeed(clip);
export const cacheKey = (sourceId: string, speed: number): string => `${sourceId}:${speed}`;
export function audioClipLength(clip: { inStartSec: number; inEndSec: number; speed?: number }, cache?: AudioCacheEntry): number {
  const speed = clipSpeed(clip);
  const length = playLength(clip.inStartSec, clip.inEndSec, speed);
  return cache ? Math.max(0, Math.min(length, cache.durationSec - clip.inStartSec / speed)) : length;
}
