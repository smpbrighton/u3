import { describe, expect, it } from "vitest";
import { stackCaptionRows } from "../../src/core/layout";
import { captionTargetBox, mediaTargetBox, resizeNormalizedBox } from "../../src/core/preview-geometry";

describe("paired caption rows", () => {
  it("stacks main above sub without overlapping backgrounds", () => {
    const rows = stackCaptionRows(1480, { main: 178, sub: 136 });
    expect(rows.sub).toEqual({ top: 1344, height: 136 });
    expect(rows.main).toEqual({ top: 1166, height: 178 });
    expect(rows.main!.top + rows.main!.height).toBeLessThanOrEqual(rows.sub!.top);
  });

  it("anchors a single row at the layer bottom", () => {
    expect(stackCaptionRows(1480, { main: 178 })).toEqual({ main: { top: 1302, height: 178 } });
    expect(stackCaptionRows(1480, { sub: 136 })).toEqual({ sub: { top: 1344, height: 136 } });
  });
});

describe("preview target boxes", () => {
  it("uses the media aspect ratio for overlay and watermark boxes", () => {
    const box = mediaTargetBox({ x: 0.5, y: 0.5 }, 0.6, 0.75);
    expect(box.width).toBeCloseTo(0.6);
    expect(box.height).toBeCloseTo(0.6 * 0.75 * 1080 / 1920);
    expect(box.x).toBeCloseTo(0.2);
    expect(box.y).toBeCloseTo(0.5 - box.height / 2);
  });

  it("covers the rendered caption block from its bottom-center anchor", () => {
    const box = captionTargetBox({ x: 0.5, y: 0.77 }, { width: 900, height: 314 });
    expect(box.width).toBeCloseTo(900 / 1080);
    expect(box.height).toBeCloseTo(314 / 1920);
    expect(box.x).toBeCloseTo(0.5 - 450 / 1080);
    expect(box.y + box.height).toBeCloseTo(0.77);
  });
});

describe("짤 선택 상자 폭 조절", () => {
  it("HOPEFULLY의 폭을 조절하는 동안 높이도 표시 비율에 맞춘다", () => {
    const box = mediaTargetBox({ x: 0.5, y: 0.4 }, 0.6, 258 / 320);
    const resized = resizeNormalizedBox(box, 108, 1080, 0.05, true);
    expect(resized.width).toBeCloseTo(0.7);
    expect(resized.height / resized.width).toBeCloseTo(258 / 320 * 1080 / 1920);
  });
});
