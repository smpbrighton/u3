import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { findVideoClipAtTime } from "../../src/core/timeline/video-pointer";
import { timelinePointerSeconds } from "../../src/ui/studio/timeline-zoom";

const timeline: Timeline = {
  video: [
    { id: "main", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 3 },
    { id: "second", kind: "main", inputId: "in", inStartSec: 3, inEndSec: 5 },
  ],
  overlays: [[{ id: "upper", kind: "video", inputId: "in", startSec: 1, inStartSec: 5, inEndSec: 7, x: 0.5, y: 0.5, width: 0.6 }]],
  captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};

describe("C 키 영상 분할 판정", () => {
  it("화면 포인터 x를 확대와 스크롤을 반영한 타임라인 시각으로 바꾼다", () => {
    expect(timelinePointerSeconds(270, 100, 120, 4)).toBeCloseTo(270 / 102);
  });

  it("영상 1 클립 안쪽 포인터를 찾는다", () => {
    expect(findVideoClipAtTime(timeline, "video", 1.5)).toEqual({ id: "main", atSec: 1.5 });
    expect(findVideoClipAtTime(timeline, "video", 3.5)).toEqual({ id: "second", atSec: 3.5 });
  });

  it("모든 영상 오버레이 트랙에서 포인터 아래 클립을 찾는다", () => {
    expect(findVideoClipAtTime(timeline, "video-2", 2)).toEqual({ id: "upper", atSec: 2 });
  });

  it("클립의 앞뒤 0.1초 구간과 클립 바깥은 자르지 않는다", () => {
    expect(findVideoClipAtTime(timeline, "video", 0.1)).toBeNull();
    expect(findVideoClipAtTime(timeline, "video", 2.9)).toBeNull();
    expect(findVideoClipAtTime(timeline, "video", 3)).toBeNull();
    expect(findVideoClipAtTime(timeline, "video-2", 0.9)).toBeNull();
    expect(findVideoClipAtTime(timeline, "video-3", 2)).toBeNull();
  });
});
