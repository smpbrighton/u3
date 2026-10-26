import type { CarouselBox, CarouselSlide } from "../../../core/carousel";

export function showsBackgroundSection(slide: CarouselSlide | undefined): boolean {
  return slide?.background.kind === "frame";
}

export function canReextractFrame(background: { kind: "generated" | "frame" }, sourceProjectExists: boolean): boolean {
  return background.kind === "frame" && sourceProjectExists;
}

export function frameTimeRange(durationSec: number): { min: number; max: number; step: number } {
  return { min: 0, max: Math.max(0, durationSec), step: 0.1 };
}

export function defaultHighlightBox(): CarouselBox {
  return { left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 };
}

export function highlightRequestBody(highlight: {
  style: "border" | "dim" | "zoom" | "ai-outline";
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
