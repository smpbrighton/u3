import { describe, expect, it } from "vitest";
import { canReextractFrame, defaultHighlightBox, frameTimeRange, highlightRequestBody, showsBackgroundSection } from "../../src/ui/screens/carousel/derived-ui-state";
import type { CarouselSlide } from "../../src/core/carousel";

const generated = { kind: "generated" as const };
const frame = { kind: "frame" as const, sec: 2.4, cropY: 0.5, status: "done" as const };

describe("derived carousel UI state", () => {
  it("shows the background editor only for frame slides", () => {
    const slide = (background: CarouselSlide["background"]) => ({ background }) as CarouselSlide;
    expect(showsBackgroundSection(slide(frame))).toBe(true);
    expect(showsBackgroundSection(slide(generated))).toBe(false);
    expect(showsBackgroundSection(undefined)).toBe(false);
  });

  it("allows frame extraction only while the source project exists", () => {
    expect(canReextractFrame(frame, true)).toBe(true);
    expect(canReextractFrame(frame, false)).toBe(false);
    expect(canReextractFrame(generated, true)).toBe(false);
  });

  it("sets the frame time slider range inside the source duration", () => {
    expect(frameTimeRange(42.5)).toEqual({ min: 0, max: 42.5, step: 0.1 });
    expect(frameTimeRange(-1).max).toBe(0);
  });

  it("creates a centered default box and an engine-safe highlight request", () => {
    const box = defaultHighlightBox();
    expect(box).toEqual({ left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 });
    expect(highlightRequestBody({ style: "border", target: "상품", box, color: "#ffffff", width: 4 })).toEqual({ style: "border", target: "상품", box, color: "#ffffff", width: 4 });
  });
});
