import opentype from "opentype.js";
import type { CaptionFontKey, FontRole } from "./fonts";

export const MEASURE_MARGIN = 0.04;

export interface TextStyle {
  role?: FontRole;
  weight: 400 | 700;
  fontSize: number;
  font?: CaptionFontKey;
  letterSpacing?: number;
}

export interface Measurer {
  /** 안전 여유를 곱한 폭(px). 레이아웃·검사는 이 값을 쓴다. */
  width(text: string, style: TextStyle): number;
  /** 여유 없는 opentype 폭(px). */
  rawWidth(text: string, style: TextStyle): number;
  readonly margin: number;
}

export interface FontData {
  role?: FontRole;
  weight: number;
  key?: CaptionFontKey;
  data: ArrayBuffer;
}

export function createMeasurer(fonts: FontData[], margin = MEASURE_MARGIN): Measurer {
  const parsed = new Map<string, opentype.Font>();
  for (const f of fonts) {
    const font = opentype.parse(f.data);
    parsed.set(`${f.role}-${f.weight}`, font);
    if (f.key) parsed.set(f.key, font);
  }
  const cache = new Map<string, number>();

  const rawWidth = (text: string, style: TextStyle): number => {
    const key = style.font ?? `${style.role}-${style.weight}`;
    const font = parsed.get(key);
    if (!font) throw new Error(`측정 폰트 없음: ${key}`);
    const ck = `${key}|${style.fontSize}|${style.letterSpacing ?? 0}|${text}`;
    const hit = cache.get(ck);
    if (hit !== undefined) return hit;
    const adv = font.getAdvanceWidth(text, style.fontSize, { kerning: true });
    // CSS letter-spacing은 마지막 글자를 포함해 글자마다 더해진다(스파이크에서 확인).
    const w = adv + [...text].length * (style.letterSpacing ?? 0);
    cache.set(ck, w);
    return w;
  };

  return {
    margin,
    rawWidth,
    width: (text, style) => rawWidth(text, style) * (1 + margin),
  };
}
