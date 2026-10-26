import type { CarouselBox, CarouselSlide } from "../../../core/carousel";

export function showsBackgroundSection(slide: CarouselSlide | undefined): boolean {
  return slide?.background.kind === "frame";
}

export function canReextractFrame(background: { kind: "generated" | "frame" }, sourceProjectExists: boolean): boolean {
  return background.kind === "frame" && sourceProjectExists;
}

export function canDownloadSlides(slides: readonly CarouselSlide[]): boolean {
  return slides.some(slide => slide.background.kind === "generated"
    ? !!(slide.background.image ?? slide.image) && slide.status === "done"
    : !!(slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame) && slide.background.status === "done");
}

export function frameTimeRange(durationSec: number): { min: number; max: number; step: number } {
  return { min: 0, max: Math.max(0, durationSec), step: 0.1 };
}

export function derivedFrameDuration(savedDurationSec: number | undefined, sourceTimelineDurationSec: number | undefined, slides: readonly CarouselSlide[]): number {
  if (savedDurationSec !== undefined) return Math.max(0, savedDurationSec);
  if (sourceTimelineDurationSec !== undefined) return Math.max(0, sourceTimelineDurationSec);
  return Math.max(0, ...slides.flatMap(slide => slide.background.kind === "frame" ? [slide.background.sec] : []));
}

export function defaultHighlightBox(): CarouselBox {
  return { left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 };
}

export function highlightRequestBody(highlight: {
  style: "none" | "border" | "dim" | "zoom" | "ai-outline";
  target: string;
  box?: CarouselBox;
  color?: string;
  width?: number;
}) {
  return {
    style: highlight.style,
    target: highlight.target,
    ...(highlight.box ? { box: highlight.box } : {}),
    ...(highlight.color ? { color: highlight.color } : {}),
    ...(highlight.width !== undefined ? { width: highlight.width } : {}),
  };
}
