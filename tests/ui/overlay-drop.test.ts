import { describe, expect, it } from "vitest";
import { decideOverlayDrop } from "../../src/ui/studio/overlay-drop";

describe("overlay drop 판정", () => {
  it("영상 클립 위와 overlay 행에서는 놓은 시각에 겹친 영상으로 만든다", () => {
    expect(decideOverlayDrop({ source: { kind: "photo", id: "p" }, targetTrack: "video", hitsVideoClip: true, atSec: 2, videoDurationSec: 10 })).toEqual({ kind: "overlay", startSec: 2 });
    expect(decideOverlayDrop({ source: { kind: "meme", id: "m" }, targetTrack: "overlay", hitsVideoClip: false, atSec: 2, videoDurationSec: 10 })).toEqual({ kind: "overlay", startSec: 2 });
  });
  it("영상 트랙 끝 뒤에 놓은 미디어는 본 영상으로 이어 붙인다", () => {
    expect(decideOverlayDrop({ source: { kind: "video", id: "v" }, targetTrack: "video", hitsVideoClip: false, atSec: 10, videoDurationSec: 10 })).toEqual({ kind: "append-video", startSec: 10 });
  });
  it("영상 길이 밖의 overlay 드롭을 거부한다", () => {
    expect(decideOverlayDrop({ source: { kind: "video", id: "v" }, targetTrack: "overlay", hitsVideoClip: false, atSec: 11, videoDurationSec: 10 })).toEqual({ kind: "reject" });
  });
});
