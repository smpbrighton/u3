import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { FONT_FILES } from "../../src/core/fonts";
import { createMeasurer } from "../../src/core/measure";

describe("폰트에 없는 이모지 폭", () => {
  for (const entry of FONT_FILES) {
    const bytes = readFileSync(`assets/${entry.file}`);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const font = opentype.parse(data);
    const measurer = createMeasurer([{ role: entry.role, weight: Number(entry.weight), data }]);
    const style = { role: entry.role, weight: Number(entry.weight) as 400 | 700, fontSize: 48 };

    it(`${entry.file}: 대체 글리프 폭을 확인하고 이모지를 1em으로 측정한다`, () => {
      expect(font.charToGlyphIndex("😊")).toBe(0);
      const missingWidth = font.getAdvanceWidth("😊", style.fontSize);
      console.info(`${entry.file}: 대체 글리프 ${missingWidth}px, 1em ${style.fontSize}px`);
      if (entry.family === "Gmarket Sans") expect(missingWidth).toBeCloseTo(44.16);
      expect(measurer.rawWidth("😊", style)).toBe(style.fontSize);
    });

    it(`${entry.file}: 일반 글자 폭과 여유를 유지하며 이모지 두 개를 더한다`, () => {
      const plain = font.getAdvanceWidth("자막", style.fontSize, { kerning: true });
      expect(measurer.rawWidth("자막", style)).toBe(plain);
      expect(measurer.rawWidth("자막😊😊", style)).toBeCloseTo(plain + 96);
      expect(measurer.width("😊", style)).toBeCloseTo(48 * 1.04);
      expect(measurer.rawWidth("😊", { ...style, fontSize: 72 })).toBe(72);
    });

    it.each(["👍🏽", "👩‍💻", "❤️"])(`${entry.file}: 결합 이모지 %s를 1em으로 측정한다`, emoji => {
      expect(measurer.rawWidth(emoji, style)).toBe(48);
      expect(measurer.rawWidth(emoji, { ...style, letterSpacing: 2 })).toBe(50);
    });
  }
});
