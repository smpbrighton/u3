import type { CSSProperties } from "react";

export type CarouselAspect = "4:5" | "1:1";
export type CarouselTextPlacement = "top" | "center" | "bottom";

export function carouselCanvasSize(aspect: CarouselAspect): { width: number; height: number } {
  return { width: 1080, height: aspect === "4:5" ? 1350 : 1080 };
}

export function textPlacementStyle(placement: CarouselTextPlacement): CSSProperties {
  return { justifyContent: placement === "top" ? "flex-start" : placement === "center" ? "center" : "flex-end" };
}
