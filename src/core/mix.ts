/** 한 번 재생하는 효과음의 최대 프레임 수. */
export const SFX_MAX_FRAMES = 45;
/** 효과음 유형별 재생 볼륨. */
export const SFX_VOLUME = { whoosh: 0.5, pop: 0.6, reveal: 0.7, scene: 0.35 } as const;
/** 효과음 로컬 프레임의 볼륨. 끝 fadeOutFrames 동안 0까지 선형으로 줄인다. */
export function sfxVolumeAt(frame: number, volume: number, durationInFrames: number, fadeOutFrames: number): number {
  if (frame < 0 || frame >= durationInFrames) return 0;
  if (fadeOutFrames <= 0) return volume;
  const left = durationInFrames - frame;
  return left > fadeOutFrames ? volume : volume * Math.max(0, (left - 1) / fadeOutFrames);
}
