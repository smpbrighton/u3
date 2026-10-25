import { describe, expect, it } from "vitest";
import { clampTransitionDuration, parseTransitionDuration } from "../../src/ui/studio/transition-length";

describe("전환 효과 길이 입력", () => {
  it("최대 2초와 클립 길이 절반 사이로 저장 값을 clamp한다", () => {
    expect(clampTransitionDuration(2.8, 6)).toBe(2);
    expect(clampTransitionDuration(1.8, 2)).toBe(1);
    expect(clampTransitionDuration(0.01, 4)).toBe(0.1);
    expect(clampTransitionDuration(0.7, 0.18)).toBe(0.1);
  });
  it("직접 입력은 유한한 숫자만 받아 범위로 자른다", () => {
    expect(parseTransitionDuration("3", 4, 6, 0.5)).toBe(2);
    expect(parseTransitionDuration("0.02", 4, 6, 0.5)).toBe(0.1);
    expect(parseTransitionDuration("", 4, 6, 0.5)).toBe(0.5);
    expect(parseTransitionDuration("abc", 4, 6, 0.5)).toBe(0.5);
  });
});
