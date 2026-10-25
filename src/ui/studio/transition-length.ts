export function transitionDurationLimit(clipDurationSec: number): number {
  return Math.min(2, clipDurationSec / 2);
}

export function clampTransitionDuration(value: number, clipDurationSec: number): number {
  const max = transitionDurationLimit(clipDurationSec);
  return Math.max(0.1, Math.min(max, Math.max(0.1, Number.isFinite(value) ? value : 0.5)));
}

export function parseTransitionDuration(raw: string, clipDurationSec: number, maxDuration: number, previous = 0.5): number {
  const value = raw.trim() === "" ? Number.NaN : Number(raw);
  const limit = Math.min(transitionDurationLimit(clipDurationSec), maxDuration);
  const clamp = (number: number) => Math.max(0.1, Math.min(limit, Math.max(0.1, number)));
  return Number.isFinite(value) ? clamp(value) : clamp(previous);
}
