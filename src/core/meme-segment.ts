export interface MemeSegmentInput {
  originalDurationSec: number;
  sceneDurationInFrames: number;
  fps: number;
  /** 원본에서 재생을 시작할 위치(초). 기본 0. 반복할 때도 여기서 다시 시작한다 */
  startSec?: number;
}

export interface MemeSegment {
  /** 원본을 한 번 재생하는 프레임 수(반복 주기). 원본 끝을 넘지 않도록 내림하고, 최소 1 */
  loopFrames: number;
  /** 장면 안에서 짤이 보이는 프레임 수. 장면 길이와 같다 */
  playFrames: number;
  /** 원본을 처음부터 시작하는 횟수 = ceil(playFrames / loopFrames). 1이면 반복 없음(긴 원본은 장면 끝에서 잘림) */
  loops: number;
  startSec: number;
  originalDurationSec: number;
  /** 장면 길이(초) = playFrames / fps */
  usedDurationSec: number;
  warnings: string[];
}

const EPS = 1e-9;

/** 원본 한 번 재생의 프레임 수. */
export function memeLoopFrames(originalDurationSec: number, fps: number, startSec = 0): number {
  const available = Math.max(0, originalDurationSec - Math.max(0, startSec));
  return Math.max(1, Math.floor(available * fps + EPS));
}

export function memeSegment(input: MemeSegmentInput): MemeSegment {
  const { fps } = input;
  const playFrames = Math.max(1, Math.floor(input.sceneDurationInFrames));
  const startSec = Math.max(0, input.startSec ?? 0);
  const warnings: string[] = [];
  if (input.originalDurationSec - startSec < 1 / fps - EPS)
    warnings.push(`짤 시작 위치(${startSec.toFixed(2)}초)가 원본 끝(${input.originalDurationSec.toFixed(2)}초)에 닿아 한 프레임만 반복합니다`);
  const loopFrames = memeLoopFrames(input.originalDurationSec, fps, startSec);
  return {
    loopFrames,
    playFrames,
    loops: Math.ceil(playFrames / loopFrames),
    startSec,
    originalDurationSec: input.originalDurationSec,
    usedDurationSec: playFrames / fps,
    warnings,
  };
}

/** 장면 프레임 f(0부터)에 보이는 원본 프레임(시작 위치 기준). 반복하면 0으로 돌아가고, 같은 프레임에 머무는 구간은 없다. */
export function memeSourceFrame(seg: Pick<MemeSegment, "loopFrames" | "playFrames">, sceneFrame: number): number {
  const f = Math.max(0, Math.min(Math.floor(sceneFrame), seg.playFrames - 1));
  return f % seg.loopFrames;
}

/**
 * 에셋에 적힌 원본 길이·사용 길이(장면 길이)로 원본을 처음부터 시작하는 횟수를 센다.
 * 1이면 반복 없이 한 번(원본이 장면보다 길면 잘린 한 번)이다.
 */
export function memeLoopCount(originalDurationSec: number, usedDurationSec: number, fps: number): number {
  const playFrames = Math.max(1, Math.round(usedDurationSec * fps));
  return Math.ceil(playFrames / memeLoopFrames(originalDurationSec, fps));
}
