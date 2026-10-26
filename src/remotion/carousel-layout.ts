import type { CSSProperties } from "react";

export type CarouselAspect = "4:5" | "1:1" | "9:16" | "16:9";
export type CarouselTextPlacement = "top" | "center" | "bottom";

export function carouselCanvasSize(aspect: CarouselAspect): { width: number; height: number } {
  if (aspect === "4:5") return { width: 1080, height: 1350 };
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function textPlacementStyle(placement: CarouselTextPlacement): CSSProperties {
  return { justifyContent: placement === "top" ? "flex-start" : placement === "center" ? "center" : "flex-end" };
}

export function carouselHighlightInput(highlight: { style: "none" | "border" | "dim" | "zoom" | "ai-outline"; target?: string; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined): { style: "border" | "dim" | "zoom"; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined {
  if (!highlight || highlight.style === "none" || highlight.style === "ai-outline") return undefined;
  return { style: highlight.style, ...(highlight.box ? { box: highlight.box } : {}), ...(highlight.color ? { color: highlight.color } : {}), ...(highlight.width ? { width: highlight.width } : {}) };
}
