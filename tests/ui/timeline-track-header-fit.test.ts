import { describe, expect, it } from "vitest";
import { timelineTrackHeaderLayout } from "../../src/ui/studio/timeline-layout";

describe("트랙 머리 항목의 폭", () => {
  it.each([
    ["음성", true, true], ["원본 소리", true, false],
    ["효과음 12", true, false], ["아주 긴 자막 레이어 이름 메인", false, false],
  ] as const)("%s의 이름과 버튼이 머리 칸 안에 들어간다", (name, audio, voice) => {
    const layout = timelineTrackHeaderLayout(name, audio, voice);
    expect(layout.nameWidth).toBeGreaterThan(0);
    expect(layout.contentWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.generateWidth).toBe(0);
  });
});
