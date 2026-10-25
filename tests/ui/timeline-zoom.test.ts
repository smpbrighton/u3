import { describe, expect, it } from "vitest";
import {
  pixelsToSeconds,
  secondsToPixels,
  scaleWidthForZoom,
  scrollLeftForZoomAnchor,
  zoomFromPinch,
  zoomFromWheel,
} from "../../src/ui/studio/timeline-zoom";

describe("studio timeline zoom", () => {
  it("wheel delta scales continuously and clamps zoom to one through ten", () => {
    expect(zoomFromWheel(4, -1)).toBeGreaterThan(4);
    expect(zoomFromWheel(4, -1)).toBeLessThan(4.1);
    expect(zoomFromWheel(4, 1)).toBeLessThan(4);
    expect(zoomFromWheel(9.9, -5000)).toBe(10);
    expect(zoomFromWheel(1.1, 5000)).toBe(1);
  });

  it("pinch scale changes zoom continuously in both directions", () => {
    expect(zoomFromPinch(4, 1.2)).toBeCloseTo(4.8);
    expect(zoomFromPinch(4, 0.8)).toBeCloseTo(3.2);
    expect(zoomFromPinch(9, 2)).toBe(10);
    expect(zoomFromPinch(2, 0.1)).toBe(1);
  });

  it("keeps the pointer time fixed after a zoom change", () => {
    const previousWidth = scaleWidthForZoom(4);
    const nextWidth = scaleWidthForZoom(6.5);
    const nextScroll = scrollLeftForZoomAnchor(320, 240, previousWidth, nextWidth);

    expect(pixelsToSeconds(320 + 240, previousWidth)).toBeCloseTo(
      pixelsToSeconds(nextScroll + 240, nextWidth),
    );
  });

  it("converts pixels and seconds with the same scale mapping", () => {
    const width = scaleWidthForZoom(4.25);
    expect(secondsToPixels(pixelsToSeconds(174, width), width)).toBeCloseTo(174);
    expect(scaleWidthForZoom(4.25)).toBeCloseTo(106.5);
  });
});
