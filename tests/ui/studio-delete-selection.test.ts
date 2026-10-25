import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { deleteStudioSelection } from "../../src/ui/studio/delete-selection";

const timeline: Timeline = {
  video: [{ id: "v", kind: "main", inputId: "in", durationSec: 4 }], overlays: [],
  captions: [{ id: "c", startSec: 0, endSec: 1, text: "안녕" }],
  voice: [{ id: "voice", startSec: 0, file: "voice.wav", inStartSec: 0, inEndSec: 1, gain: 1 }],
  sfx: [{ id: "sfx", startSec: 0, file: "sfx.wav", inStartSec: 0, inEndSec: 1, gain: 1 }],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};

describe("스튜디오 선택 삭제", () => {
  it("선택한 자막·음성·효과음 클립을 해당 행에서 삭제한다", () => {
    expect(deleteStudioSelection(timeline, "captions", "c").timeline.captions).toEqual([]);
    expect(deleteStudioSelection(timeline, "voice", "voice").timeline.voice).toEqual([]);
    expect(deleteStudioSelection(timeline, "sfx", "sfx").timeline.sfx).toEqual([]);
  });
  it("영상 1의 마지막 클립을 삭제하지 않고 막는다", () => {
    expect(deleteStudioSelection(timeline, "video", "v")).toMatchObject({ timeline, blocked: true });
  });
});
