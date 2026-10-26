import { describe, expect, it } from "vitest";
import { sceneFrameSec, frameCropPosition } from "../../src/core/carousel-frame";
import type { Timeline } from "../../src/core/schema";

const timeline: Timeline = {
  video: [
    { id: "v1", kind: "main", inputId: "input-1", inStartSec: 0, inEndSec: 4 },
    { id: "meme", kind: "meme", memeId: "m1", durationSec: 2 },
    { id: "v2", kind: "main", inputId: "input-1", inStartSec: 8, inEndSec: 12 },
  ],
  overlays: [], captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};

describe("carousel frame selection", () => {
  it("maps a script scene number to the center of its main-video source range", () => {
    const scenes = [
      { caption: "첫 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 1, endSec: 3 },
      { caption: "두 번째", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 8, endSec: 10 },
    ];
    expect(sceneFrameSec(scenes, timeline, 1)).toBe(2);
    expect(sceneFrameSec(scenes, timeline, 2)).toBe(8);
  });

  it("moves a scene centered in a meme clip to the nearest main-video frame", () => {
    const scenes = [{ caption: "짤 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 5, endSec: 7 }];
    expect(sceneFrameSec(scenes, timeline, 1)).toBe(4);
  });

  it("maps cropY to the vertical object position and clamps it", () => {
    expect(frameCropPosition(0)).toBe("50% 0%");
    expect(frameCropPosition(0.4)).toBe("50% 40%");
    expect(frameCropPosition(1)).toBe("50% 100%");
    expect(frameCropPosition(2)).toBe("50% 100%");
  });
});
