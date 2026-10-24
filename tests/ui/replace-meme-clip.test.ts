import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { replaceMemeClip } from "../../src/ui/studio/replace-meme-clip";

function createTimeline(): Timeline {
  return {
    video: [
      { id: "main-1", kind: "main", inputId: "input-1", inStartSec: 0, inEndSec: 2 },
      { id: "meme-1", kind: "meme", memeId: "meme-old", durationSec: 1.5 },
    ],
    captions: [{ id: "caption-1", startSec: 0, endSec: 2, text: "caption" }],
    voice: [],
    sfx: [],
    audio: {
      source: { gain: 1, muted: false },
      voice: { gain: 1, muted: false },
      sfx: { gain: 1, muted: false },
    },
  };
}

describe("replaceMemeClip", () => {
  it("replaces the selected meme while preserving the rest of the timeline", () => {
    const timeline = createTimeline();
    const updated = replaceMemeClip(timeline, "meme-1", "meme-new");

    expect(updated.video[1]).toEqual({ id: "meme-1", kind: "meme", memeId: "meme-new", durationSec: 1.5 });
    expect(updated.video[0]).toBe(timeline.video[0]);
    expect(updated.captions).toBe(timeline.captions);
    expect(timeline.video[1]).toEqual({ id: "meme-1", kind: "meme", memeId: "meme-old", durationSec: 1.5 });
  });

  it("returns the same timeline when the target is missing or is not a meme", () => {
    const timeline = createTimeline();

    expect(replaceMemeClip(timeline, "main-1", "meme-new")).toBe(timeline);
    expect(replaceMemeClip(timeline, "missing", "meme-new")).toBe(timeline);
  });
});
