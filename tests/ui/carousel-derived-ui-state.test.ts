import { describe, expect, it } from "vitest";
import { canDownloadSlides, canReextractFrame, defaultHighlightBox, derivedFrameDuration, frameTimeRange, highlightRequestBody, showsBackgroundSection } from "../../src/ui/screens/carousel/derived-ui-state";
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

  it("prefers a saved timeline duration and falls back for older derived carousels", () => {
    const slides = [
      { id: "slide-1", title: "", body: "", textPlacement: "bottom" as const, background: { ...frame, sec: 4.5 }, status: "idle" as const },
      { id: "slide-2", title: "", body: "", textPlacement: "bottom" as const, background: { ...frame, sec: 8.2 }, status: "idle" as const },
    ] as CarouselSlide[];
    expect(derivedFrameDuration(42, 60, slides)).toBe(42);
    expect(derivedFrameDuration(undefined, 60, slides)).toBe(60);
    expect(derivedFrameDuration(undefined, undefined, slides)).toBe(8.2);
    expect(frameTimeRange(derivedFrameDuration(undefined, undefined, slides))).toEqual({ min: 0, max: 8.2, step: 0.1 });
  });

  it("disables download when no slide is complete", () => {
    const idle = { id: "slide-1", title: "", body: "", textPlacement: "bottom" as const, background: { kind: "generated" as const }, status: "idle" as const } as CarouselSlide;
    const done = { ...idle, image: { file: "images/slide-1.png" }, status: "done" as const };
    expect(canDownloadSlides([idle])).toBe(false);
    expect(canDownloadSlides([done])).toBe(true);
  });

  it("creates a centered default box and an engine-safe highlight request", () => {
    const box = defaultHighlightBox();
    expect(box).toEqual({ left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 });
    expect(highlightRequestBody({ style: "border", target: "상품", box, color: "#ffffff", width: 4 })).toEqual({ style: "border", target: "상품", box, color: "#ffffff", width: 4 });
  });
});
