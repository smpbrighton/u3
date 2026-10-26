import type { CaptionChunk } from "./captions";
import type { Measurer, TextStyle } from "./measure";
import { CANVAS, CENTER_X, SAFE_WIDTH, centeredBox, type Box } from "./geometry";

export const TITLE_TOP = 220;
export const TITLE_LINE_HEIGHT = 1.15;
export const TITLE_SIZES = [84, 80, 76, 72, 68, 64, 60, 56] as const;
export const TITLE_MAX_LINE_WIDTH = SAFE_WIDTH - 20;
export const CAPTION_STYLE: TextStyle = { role: "body", weight: 700, fontSize: 56 };
export const CAPTION_LINE_HEIGHT = 1.3;
export const CAPTION_PAD_X = 28;
export const CAPTION_PAD_Y = 16;
export const CAPTION_MAX_LINES = 2;
export const CAPTION_MAX_LINE_WIDTH = SAFE_WIDTH - 2 * CAPTION_PAD_X;
export const CAPTION_BOX_HEIGHT_MAX = CAPTION_MAX_LINES * CAPTION_STYLE.fontSize * CAPTION_LINE_HEIGHT + 2 * CAPTION_PAD_Y;
export const CAPTION_CENTER_Y = 1450;

export interface TextBlock { lines: string[]; fontSize: number; lineHeight: number; box: Box; overflow: boolean }
export interface CaptionBlock { chunkIndex: number; lines: string[]; box: Box; overflow: boolean }
export interface LayoutElement { id: string; role: "title" | "caption"; box: Box; critical: boolean; effects: boolean; overflow: boolean }
export interface Layout { title: TextBlock; captions: CaptionBlock[]; elements: LayoutElement[] }
export interface LayoutInput { title: string; captions: CaptionChunk[] }

export function wrapWords(text: string, maxWidth: number, maxLines: 1 | 2, width: (s: string) => number): string[] | null {
  const words = text.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const one = words.join(" ");
  if (width(one) <= maxWidth) return [one];
  if (maxLines === 1) return null;
  if (words.length === 1) {
    const graphemes = Array.from(words[0]!);
    if (graphemes.length < 2) return null;
    let best: string[] | null = null;
    let bestWidth = Infinity;
    for (let k = 1; k < graphemes.length; k++) {
      const lines = [graphemes.slice(0, k).join(""), graphemes.slice(k).join("")];
      const widest = Math.max(...lines.map(width));
      if (widest <= maxWidth && widest < bestWidth) { best = lines; bestWidth = widest; }
    }
    return best;
  }
  let best: string[] | null = null;
  let bestWidth = Infinity;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const widest = Math.max(...lines.map(width));
    if (widest <= maxWidth && widest < bestWidth) { best = lines; bestWidth = widest; }
  }
  return best;
}

function forceTwoLines(text: string, width: (s: string) => number): string[] {
  const words = text.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    const graphemes = Array.from(words[0] ?? "");
    if (graphemes.length < 2) return [words.join(" ")];
    let best = [graphemes.join("")];
    let bestWidth = Infinity;
    for (let k = 1; k < graphemes.length; k++) {
      const lines = [graphemes.slice(0, k).join(""), graphemes.slice(k).join("")];
      const widest = Math.max(...lines.map(width));
      if (widest < bestWidth) { best = lines; bestWidth = widest; }
    }
    return best;
  }
  let best = [words.join(" ")];
  let bestWidth = Infinity;
  for (let k = 1; k < words.length; k++) {
    const pair = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const widest = Math.max(...pair.map(width));
    if (widest < bestWidth) { best = pair; bestWidth = widest; }
  }
  return best;
}

export interface CaptionTextFit { lines: string[]; fontSize: number; overflow: boolean }

export function fitCaptionText(
  text: string,
  maxWidth: number,
  widthAtSize: (line: string, fontSize: number) => number,
  minFontSize = 30,
  maxFontSize = CAPTION_STYLE.fontSize,
): CaptionTextFit {
  const step = 2;
  let lastSize = maxFontSize;
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= step) {
    lastSize = fontSize;
    const lines = wrapWords(text, maxWidth, 2, (line) => widthAtSize(line, fontSize));
    if (lines) return { lines, fontSize, overflow: false };
  }
  const lines = forceTwoLines(text, (line) => widthAtSize(line, lastSize));
  return {
    lines,
    fontSize: lastSize,
    overflow: lines.some((line) => widthAtSize(line, lastSize) > maxWidth),
  };
}

export function layoutTitle(title: string, m: Measurer): TextBlock {
  let chosen: { lines: string[]; size: number } | null = null;
  for (const size of TITLE_SIZES) {
    const style: TextStyle = { role: "display", weight: 400, fontSize: size };
    const lines = wrapWords(title, TITLE_MAX_LINE_WIDTH, 2, (s) => m.width(s, style));
    if (lines) { chosen = { lines, size }; break; }
  }
  const overflow = chosen === null;
  const size = chosen?.size ?? TITLE_SIZES[TITLE_SIZES.length - 1];
  const style: TextStyle = { role: "display", weight: 400, fontSize: size };
  const lines = chosen?.lines ?? forceTwoLines(title, (s) => m.width(s, style));
  const width = Math.max(0, ...lines.map((line) => m.width(line, style))) + 20;
  const height = lines.length * size * TITLE_LINE_HEIGHT;
  return { lines, fontSize: size, lineHeight: TITLE_LINE_HEIGHT, box: { x: CENTER_X - width / 2, y: TITLE_TOP, width, height }, overflow };
}

export function layoutCaption(chunk: CaptionChunk, chunkIndex: number): CaptionBlock {
  const textWidth = Math.max(0, ...chunk.lines.map((line) => line.width));
  const width = textWidth + 2 * CAPTION_PAD_X;
  const height = chunk.lines.length * CAPTION_STYLE.fontSize * CAPTION_LINE_HEIGHT + 2 * CAPTION_PAD_Y;
  return { chunkIndex, lines: chunk.lines.map((line) => line.text), box: centeredBox(CENTER_X, CAPTION_CENTER_Y, width, height), overflow: chunk.overflow || chunk.lines.length > CAPTION_MAX_LINES || textWidth > CAPTION_MAX_LINE_WIDTH };
}

export function computeLayout(input: LayoutInput, m: Measurer): Layout {
  const title = layoutTitle(input.title, m);
  const captions = input.captions.map(layoutCaption);
  const elements: LayoutElement[] = [
    { id: "title", role: "title", box: title.box, critical: true, effects: false, overflow: title.overflow },
    ...captions.map((caption) => ({ id: `caption:${caption.chunkIndex}`, role: "caption" as const, box: caption.box, critical: true, effects: true, overflow: caption.overflow })),
  ];
  return { title, captions, elements };
}
