import { describe, expect, it } from "vitest";
import { memeLoopCount, memeLoopFrames, memeSegment, memeSourceFrame, type MemeSegment } from "../../src/core/meme-segment";

const sourceFrames = (s: MemeSegment) => Array.from({ length: s.playFrames }, (_, f) => memeSourceFrame(s, f));

/** 장면 안에서 같은 원본 프레임이 두 프레임 이상 이어지면(멈춤) true */
const holds = (frames: number[]) => frames.some((v, i) => i > 0 && v === frames[i - 1]);

describe("짤 구간: 장면 전체 동안 보인다(사용자 지시로 N-5의 3초 정지를 대체)", () => {
  it("장면보다 짧은 짤은 처음부터 다시 재생해 장면을 채운다", () => {
    const s = memeSegment({ originalDurationSec: 2, sceneDurationInFrames: 150, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 60, playFrames: 150, loops: 3, startSec: 0, originalDurationSec: 2, usedDurationSec: 5, warnings: [] });
    const src = sourceFrames(s);
    expect(src[0]).toBe(0);
    expect(src[59]).toBe(59);
    expect(src[60]).toBe(0);
    expect(src[149]).toBe(29);
    for (let f = 0; f + 60 < 150; f++) expect(src[f + 60]).toBe(src[f]);
    expect(holds(src)).toBe(false);
  });

  it("아주 짧은 짤(0.2초)도 반복하고 경고하지 않는다", () => {
    const s = memeSegment({ originalDurationSec: 0.2, sceneDurationInFrames: 90, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 6, playFrames: 90, loops: 15, usedDurationSec: 3, warnings: [] });
    const src = sourceFrames(s);
    expect(src.slice(0, 13)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0]);
    expect(holds(src)).toBe(false);
  });

  it("장면보다 긴 짤은 처음부터 재생하다 장면 끝에서 자른다(반복·정지 없음)", () => {
    const s = memeSegment({ originalDurationSec: 8, sceneDurationInFrames: 45, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 240, playFrames: 45, loops: 1, usedDurationSec: 1.5, warnings: [] });
    expect(sourceFrames(s)).toEqual(Array.from({ length: 45 }, (_, f) => f));
  });

  it("3초를 넘는 장면에서도 멈추지 않는다", () => {
    const s = memeSegment({ originalDurationSec: 8, sceneDurationInFrames: 180, fps: 30 });
    expect(s.playFrames).toBe(180);
    expect(s.loops).toBe(1);
    const src = sourceFrames(s);
    expect(src[90]).toBe(90);
    expect(src[179]).toBe(179);
    expect(holds(src)).toBe(false);
  });

  it("원본과 장면 길이가 같으면 한 번 재생한다", () => {
    const s = memeSegment({ originalDurationSec: 3, sceneDurationInFrames: 90, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 90, loops: 1 });
  });

  it("시작 위치를 주면 남은 길이를 반복 주기로 쓴다", () => {
    const s = memeSegment({ originalDurationSec: 8, startSec: 6, sceneDurationInFrames: 150, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 60, loops: 3, startSec: 6, warnings: [] });
  });

  it("시작 위치가 원본 끝에 닿으면 한 프레임만 반복하고 경고한다", () => {
    const s = memeSegment({ originalDurationSec: 2, startSec: 2, sceneDurationInFrames: 30, fps: 30 });
    expect(s).toMatchObject({ loopFrames: 1, loops: 30 });
    expect(s.warnings).toHaveLength(1);
  });

  it("반복 주기는 원본 끝을 넘지 않도록 내림한다", () => {
    expect(memeLoopFrames(1.5, 30)).toBe(45);
    expect(memeLoopFrames(1.49, 30)).toBe(44);
    expect(memeLoopFrames(0.01, 30)).toBe(1);
  });

  it("에셋의 원본 길이·사용 길이(장면 길이)로 반복 횟수를 센다", () => {
    expect(memeLoopCount(1.5, 167 / 30, 30)).toBe(4);
    expect(memeLoopCount(2, 5, 30)).toBe(3);
    expect(memeLoopCount(0.2, 3, 30)).toBe(15);
    expect(memeLoopCount(8, 1.5, 30)).toBe(1);
    expect(memeLoopCount(3, 3, 30)).toBe(1);
  });
});
