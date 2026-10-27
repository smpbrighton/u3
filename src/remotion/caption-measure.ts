import { CAPTION_FONT_FAMILY } from "../core/fonts";
import { CAPTION_LINE_HEIGHT, CAPTION_MAX_LINE_WIDTH, CAPTION_PAD_X, CAPTION_PAD_Y, fitCaptionText } from "../core/layout";
import type { CaptionStyle } from "../core/schema";

export interface CaptionMeasure { lines: string[]; fontSize: number; width: number; height: number }

export const captionWeight = (font: keyof typeof CAPTION_FONT_FAMILY) => font === "tmon" ? 400 : 700;

let context: CanvasRenderingContext2D | null = null;

/** 자막 한 줄(메인 또는 서브)의 글줄과 배경 상자 크기를 캔버스 픽셀로 잰다. */
export function measureCaption(text: string, style: CaptionStyle, row: "main" | "sub"): CaptionMeasure {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("자막 측정 canvas를 만들 수 없습니다");
  const measure = context;
  const baseSize = row === "main" ? style.mainSize : style.subSize;
  const fontFamily = CAPTION_FONT_FAMILY[style.font];
  const fit = fitCaptionText(text, CAPTION_MAX_LINE_WIDTH, (value, fontSize) => {
    measure.font = `${captionWeight(style.font)} ${fontSize}px ${fontFamily}`;
    return measure.measureText(value).width * 1.04;
  }, 20, baseSize);
  const width = (value: string) => {
    measure.font = `${captionWeight(style.font)} ${fit.fontSize}px ${fontFamily}`;
    return measure.measureText(value).width * 1.04;
  };
  const height = fit.lines.length * fit.fontSize * CAPTION_LINE_HEIGHT + 2 * CAPTION_PAD_Y;
  return { lines: fit.lines, fontSize: fit.fontSize, height, width: Math.min(CAPTION_MAX_LINE_WIDTH + 2 * CAPTION_PAD_X, Math.max(160, ...fit.lines.map(width)) + 2 * CAPTION_PAD_X) };
}
