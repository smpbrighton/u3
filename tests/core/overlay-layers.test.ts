import { describe, expect, it } from "vitest";
import { placeOverlayInLowestLayer, removeOverlayFromLayers } from "../../src/core/timeline/overlay-layers";
import type { OverlayClip } from "../../src/core/schema";

const clip = (id: string, startSec: number, durationSec: number): OverlayClip => ({ id, memeId: id, startSec, durationSec, x: 0.5, y: 0.5, width: 0.6 });

describe("겹친 영상 층 배정", () => {
  it("겹치지 않는 가장 아래 층에 놓고 모든 층이 겹치면 새 층을 만든다", () => {
    expect(placeOverlayInLowestLayer([], clip("a", 0, 2))).toEqual([[clip("a", 0, 2)]]);
    const layers = [[clip("a", 0, 2)], [clip("b", 2, 2)]];
    expect(placeOverlayInLowestLayer(layers, clip("c", 1, 2))).toEqual([[clip("a", 0, 2)], [clip("b", 2, 2)], [clip("c", 1, 2)]]);
    expect(placeOverlayInLowestLayer(layers, clip("d", 4, 1))).toEqual([[clip("a", 0, 2), clip("d", 4, 1)], [clip("b", 2, 2)]]);
  });
  it("클립 삭제 뒤 빈 층을 없애고 위 층을 아래로 당긴다", () => {
    const layers = [[clip("a", 0, 2)], [clip("b", 0, 2)], [clip("c", 0, 2)]];
    expect(removeOverlayFromLayers(layers, "b")).toEqual([[clip("a", 0, 2)], [clip("c", 0, 2)]]);
    expect(removeOverlayFromLayers([[clip("a", 0, 2)]], "a")).toEqual([]);
  });
});
