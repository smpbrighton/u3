import type { CSSProperties } from "react";
import type { CarouselTextObject, CarouselLogo } from "../core/carousel";
import { CAPTION_FONT_FAMILY } from "../core/fonts";

export type CarouselAspect = "4:5" | "1:1" | "9:16" | "16:9";

export function carouselCanvasSize(aspect: CarouselAspect): { width: number; height: number } {
  if (aspect === "4:5") return { width: 1080, height: 1350 };
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function textObjectStyle(text: CarouselTextObject, canvas: { width: number; height: number }): CSSProperties {
  return {
    position: "absolute", left: text.x * canvas.width, top: text.y * canvas.height, width: text.width * canvas.width,
    margin: 0, boxSizing: "border-box", fontFamily: CAPTION_FONT_FAMILY[text.font], fontWeight: text.weight,
    fontSize: text.fontSize * Math.min(canvas.width, canvas.height) / 1080, color: text.color, textAlign: text.align,
    lineHeight: text.role === "title" ? 1.18 : 1.5, whiteSpace: "pre-wrap", wordBreak: "keep-all", opacity: text.opacity,
    ...(text.effect === "shadow" ? { textShadow: "0 2px 12px rgba(0,0,0,.55)" } : {}),
    ...(text.effect === "bar" ? { background: text.barColor ?? "rgba(0,0,0,.55)", padding: "0.4em" } : {}),
    ...(text.effect === "outline" ? { WebkitTextStroke: "0.04em #000", textShadow: "0 2px 4px rgba(0,0,0,.55)" } : {}),
  };
}

export function shadeStyle(shade: number): CSSProperties {
  return { position: "absolute", inset: 0, background: `linear-gradient(transparent, rgba(0,0,0,${shade}))`, pointerEvents: "none" };
}

export function logoStyle(logo: CarouselLogo, canvas: { width: number; height: number }): CSSProperties {
  return { position: "absolute", left: logo.x * canvas.width, top: logo.y * canvas.height, width: logo.width * canvas.width,
    height: "auto", transform: "translate(-50%, -50%)", opacity: logo.opacity, objectFit: "contain" };
}

export function carouselHighlightInput(highlight: { style: "none" | "border" | "dim" | "zoom" | "ai-outline"; target?: string; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined): { style: "border" | "dim" | "zoom"; box?: { left: number; top: number; right: number; bottom: number }; color?: string; width?: number } | undefined {
  if (!highlight || highlight.style === "none" || highlight.style === "ai-outline") return undefined;
  return { style: highlight.style, ...(highlight.box ? { box: highlight.box } : {}), ...(highlight.color ? { color: highlight.color } : {}), ...(highlight.width ? { width: highlight.width } : {}) };
}
