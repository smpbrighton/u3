import { describe, expect, it } from "vitest";
import { clampTimeToLastFrame, frameForTime, frameToSeekAfterPlayerReady } from "../../src/ui/studio/preview-seek";

describe("미리보기 재생 헤드 프레임 계산", () => {
  it("재생 시각을 가장 가까운 유효 프레임으로 변환한다", () => {
    expect(frameForTime(5.7, 300, 30)).toBe(171);
    expect(frameForTime(-1, 300, 30)).toBe(0);
    expect(frameForTime(20, 300, 30)).toBe(299);
  });

  it("Player 준비 전에는 seek 프레임을 정하지 않고 준비 뒤 현재 시각을 반환한다", () => {
    expect(frameToSeekAfterPlayerReady(false, 5.7, 300, 30)).toBeNull();
    expect(frameToSeekAfterPlayerReady(true, 5.7, 300, 30)).toBe(171);
  });

  it("타임라인이 짧아지면 재생 헤드를 마지막 프레임 시각으로 맞춘다", () => {
    expect(clampTimeToLastFrame(12, 300, 30)).toBe(299 / 30);
    expect(clampTimeToLastFrame(5.7, 300, 30)).toBe(5.7);
    expect(clampTimeToLastFrame(5.7, 0, 30)).toBe(0);
  });
});
