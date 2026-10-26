import { describe, expect, it } from "vitest";
import { carouselHighlightInput } from "../../src/remotion/carousel-layout";

describe("carousel highlight composition input", () => {
  it("passes the border style, normalized box, color, and width", () => {
    expect(carouselHighlightInput({ style: "border", target: "상품", box: { left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 }, color: "#ff0000", width: 8 })).toEqual({ style: "border", box: { left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 }, color: "#ff0000", width: 8 });
  });

  it("passes the dim and zoom variants through the same normalized highlight shape", () => {
    const common = { target: "대상", box: { left: 0.2, top: 0.1, right: 0.6, bottom: 0.7 } };
    expect(carouselHighlightInput({ ...common, style: "dim" })?.style).toBe("dim");
    expect(carouselHighlightInput({ ...common, style: "zoom" })?.style).toBe("zoom");
  });

  it("uses the generated image instead of a box overlay for AI outline", () => {
    expect(carouselHighlightInput({ style: "ai-outline", target: "상품", box: { left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 } })).toBeUndefined();
  });
});
