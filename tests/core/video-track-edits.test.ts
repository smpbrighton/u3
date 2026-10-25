import { describe, expect, it } from "vitest";
import type { Input, Timeline } from "../../src/core/schema";
import { moveOverlayClipToVideo1, moveVideo1ClipToOverlay } from "../../src/core/timeline/video-track-edits";

const timeline: Timeline = {
  video: [
    { id: "main", kind: "main", inputId: "camera", inStartSec: 10, inEndSec: 14 },
    { id: "meme", kind: "meme", memeId: "m", durationSec: 1 },
    { id: "photo", kind: "main", inputId: "photo", durationSec: 2 },
  ],
  overlays: [], captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};
const inputs: Input[] = [
  { id: "camera", kind: "video", file: "camera.mov", durationSec: 30 },
  { id: "photo", kind: "photo", file: "photo.jpg" },
];

describe("영상 트랙 간 클립 이동", () => {
  it("영상 1에서 클립을 빼고 당겨 채우며 원래 시작 시각에 영상 2로 보낸다", () => {
    const moved = moveVideo1ClipToOverlay(timeline, "meme", inputs);
    expect(moved.video.map((clip) => clip.id)).toEqual(["main", "photo"]);
    expect(moved.overlays[0]?.[0]).toMatchObject({ id: "meme", memeId: "m", startSec: 4, durationSec: 1 });
  });
  it("영상 1의 마지막 클립은 위로 옮기지 못한다", () => {
    const last = { ...timeline, video: [timeline.video[0]!] };
    expect(() => moveVideo1ClipToOverlay(last, "main", inputs)).toThrow("영상 1에는 클립이 하나 이상 있어야 합니다");
  });
  it("영상 1의 사진을 위로 옮길 때 위치 크기 기본값을 붙인다", () => {
    const moved = moveVideo1ClipToOverlay(timeline, "photo", inputs);
    expect(moved.overlays[0]?.[0]).toMatchObject({ id: "photo", kind: "photo", inputId: "photo", startSec: 5, durationSec: 2, x: 0.5, y: 0.5, width: 0.6 });
  });
  it("영상 2의 원본 클립을 영상 1 구간 중간에 끼우고 원본 구간을 나눈다", () => {
    const withOverlay: Timeline = { ...timeline, overlays: [[{ id: "up", kind: "video", inputId: "camera", startSec: 2, inStartSec: 20, inEndSec: 22, x: 0.5, y: 0.5, width: 0.6 }]] };
    const moved = moveOverlayClipToVideo1(withOverlay, "up", 2, ["left", "right"]);
    expect(moved.video).toEqual([
      { id: "left", kind: "main", inputId: "camera", inStartSec: 10, inEndSec: 12 },
      { id: "up", kind: "main", inputId: "camera", inStartSec: 20, inEndSec: 22 },
      { id: "right", kind: "main", inputId: "camera", inStartSec: 12, inEndSec: 14 },
      timeline.video[1], timeline.video[2],
    ]);
    expect(moved.overlays).toEqual([]);
  });
  it("영상 1 경계에는 자르지 않고 넣으며 끝 뒤는 끝에 붙인다", () => {
    const withOverlay: Timeline = { ...timeline, overlays: [[{ id: "up", kind: "photo", inputId: "photo", startSec: 0, durationSec: 1, x: 0.5, y: 0.5, width: 0.6 }]] };
    const atBoundary = moveOverlayClipToVideo1(withOverlay, "up", 4, ["left", "right"]);
    expect(atBoundary.video.slice(0, 3).map((clip) => clip.id)).toEqual(["main", "up", "meme"]);
    expect(atBoundary.video[2]).toEqual({ id: "meme", kind: "meme", memeId: "m", durationSec: 1 });
    const afterEnd = moveOverlayClipToVideo1(withOverlay, "up", 99, ["left", "right"]);
    expect(afterEnd.video.at(-1)?.id).toBe("up");
  });
});
