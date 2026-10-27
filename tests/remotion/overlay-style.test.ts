import { describe, expect, it } from "vitest";
import { overlayMediaStyle } from "../../src/remotion/overlay-style";

describe("영상 2 이상 미디어 창 스타일", () => {
  it("clip 위치와 폭을 유지하면서 전환 효과를 같은 창에 적용한다", () => {
    expect(overlayMediaStyle(
      { x: 0.5, y: 0.5, width: 0.6 },
      { opacity: 0.4, transform: "translate(-8px, 0) scale(.9)", clipPath: "inset(0 0 0 40%)" },
    )).toMatchObject({
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "60%",
      opacity: 0.4,
      transform: "translate(-50%, -50%) translate(-8px, 0) scale(.9)",
      clipPath: "inset(0 0 0 40%)",
      overflow: "hidden",
    });
  });

  it("미디어 비율을 알면 높이를 정해 그려진 짤과 창 크기를 맞춘다", () => {
    const style = overlayMediaStyle({ x: 0.5, y: 0.5, width: 0.6 }, { opacity: 1, transform: "", clipPath: "none" }, 258 / 320);
    expect(parseFloat(String(style.height))).toBeCloseTo(0.6 * (258 / 320) * (1080 / 1920) * 100);
    expect(String(style.height).endsWith("%")).toBe(true);
  });

  it("미디어 비율을 모르면 높이를 auto 로 둔다", () => {
    expect(overlayMediaStyle({ x: 0.5, y: 0.5, width: 0.6 }, { opacity: 1, transform: "", clipPath: "none" }).height).toBe("auto");
  });
});
