import { describe, expect, it } from "vitest";
import { sfxVolumeAt } from "../../src/core/mix";

describe("효과음 볼륨", () => {
  it("길이 밖은 0이고, 페이드가 없으면 끝까지 그대로다", () => {
    expect(sfxVolumeAt(-1, 0.5, 30, 0)).toBe(0);
    expect(sfxVolumeAt(30, 0.5, 30, 0)).toBe(0);
    for (const f of [0, 10, 29]) expect(sfxVolumeAt(f, 0.5, 30, 0)).toBe(0.5);
  });

  it("끝 fadeOutFrames 동안 0까지 선형으로 줄어든다", () => {
    expect(sfxVolumeAt(19, 0.6, 30, 10)).toBeCloseTo(0.6, 9);
    expect(sfxVolumeAt(20, 0.6, 30, 10)).toBeCloseTo(0.6 * 0.9, 9);
    expect(sfxVolumeAt(29, 0.6, 30, 10)).toBeCloseTo(0, 9);
    const down = [20, 22, 24, 26, 28].map((f) => sfxVolumeAt(f, 0.6, 30, 10));
    for (let i = 1; i < down.length; i++) expect(down[i]!).toBeLessThan(down[i - 1]!);
  });
});
