import type { CSSProperties } from "react";

export type CarouselAspect = "4:5" | "1:1";
export type CarouselTextPlacement = "top" | "center" | "bottom";

export function carouselCanvasSize(aspect: CarouselAspect): { width: number; height: number } {
  return { width: 1080, height: aspect === "4:5" ? 1350 : 1080 };
}

export function textPlacementStyle(placement: CarouselTextPlacement): CSSProperties {
  return { justifyContent: placement === "top" ? "flex-start" : placement === "center" ? "center" : "flex-end" };
}

export function carouselHighlightInput(highlight: { style: "border" | "dim" | "zoom" | "ai-outline"; target?: string; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined): { style: "border" | "dim" | "zoom"; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined {
  if (!highlight || highlight.style === "ai-outline") return undefined;
  return { style: highlight.style, ...(highlight.box ? { box: highlight.box } : {}), ...(highlight.color ? { color: highlight.color } : {}), ...(highlight.width ? { width: highlight.width } : {}) };
}
