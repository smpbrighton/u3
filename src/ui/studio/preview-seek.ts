export function frameForTime(time: number, durationInFrames: number, fps: number): number {
  if (durationInFrames <= 0 || fps <= 0) return 0;
  const requestedFrame = Number.isFinite(time) ? Math.round(time * fps) : 0;
  return Math.max(0, Math.min(durationInFrames - 1, requestedFrame));
}

export function frameToSeekAfterPlayerReady(
  playerReady: boolean,
  time: number,
  durationInFrames: number,
  fps: number,
): number | null {
  return playerReady ? frameForTime(time, durationInFrames, fps) : null;
}

export function clampTimeToLastFrame(time: number, durationInFrames: number, fps: number): number {
  if (durationInFrames <= 0 || fps <= 0) return 0;
  const finiteTime = Number.isFinite(time) ? time : 0;
  return Math.max(0, Math.min((durationInFrames - 1) / fps, finiteTime));
}
