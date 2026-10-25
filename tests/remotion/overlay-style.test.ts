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
});
