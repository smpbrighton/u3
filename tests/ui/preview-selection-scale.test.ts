import { describe, expect, it, vi } from "vitest";
import { Timeline, captionLayersOf } from "../../src/core/schema";
import { captionSelectionBox } from "../../src/ui/studio/preview-selection";

describe("자막 선택 상자 배율", () => {
  it("메인·서브 각각의 클립 배율로 측정하고 렌더와 같은 묶음 상자를 만든다", () => {
    const layer = captionLayersOf(Timeline.parse({ captions: [{ id: "a", startSec: 0, endSec: 3, text: "글", style: { sizeScale: 1.5 } }] }))[0]!;
    layer.sub = [{ id: "s", startSec: 0, endSec: 3, text: "서브", style: { sizeScale: 0.5 } }];
    const measure = vi.fn((_text, _style, _row, scale) => ({ width: 200 * scale, height: 80 * scale }));
    const box = captionSelectionBox(layer, 1, measure)!;
    expect(measure.mock.calls.map(call => call[3])).toEqual([1.5, 0.5]);
    expect(box.width).toBeCloseTo(300 / 1080); expect(box.height).toBeCloseTo(160 / 1920);
    expect(captionSelectionBox(layer, 4, measure)).toBeNull();
  });
});
