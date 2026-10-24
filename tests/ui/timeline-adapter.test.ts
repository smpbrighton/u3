import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { reorderVideoByStart, timelineToStudioRows } from "../../src/ui/studio/timeline-adapter";

const timeline: Timeline = {
  video: [
    { id: "one", kind: "main", inputId: "source", inStartSec: 0, inEndSec: 3 },
    { id: "two", kind: "main", inputId: "photo", durationSec: 2 },
  ],
  captions: [{ id: "caption", startSec: 0.5, endSec: 1.5, text: "자막" }],
  voice: [{ id: "voice-clip", startSec: 1, file: "voice.wav", inStartSec: 0, inEndSec: 2, gain: 1 }],
  sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};

describe("studio timeline adapter", () => {
  it("Timeline을 자막·영상·소리 트랙으로 바꾼다", () => {
    const rows = timelineToStudioRows(timeline);
    expect(rows.map((row) => row.id)).toEqual(["captions", "video", "source", "voice", "sfx"]);
    expect(rows[1]?.actions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: "one", start: 0, end: 3 },
      { id: "two", start: 3, end: 5 },
    ]);
    expect(rows[2]?.actions[0]).toMatchObject({ id: "source:one", start: 0, end: 3, movable: false });
  });

  it("분리한 입력이 있을 때 목소리·배경 트랙을 보인다", () => {
    const separated = timelineToStudioRows({
      ...timeline,
      audio: {
        ...timeline.audio,
        stems: { source: { voice: { gain: 1, muted: false }, bg: { gain: 1, muted: false } } },
      },
    });
    expect(separated.map((row) => row.id)).toEqual(["captions", "video", "stem-voice", "stem-bg", "voice", "sfx"]);
    expect(separated[2]?.actions[0]).toMatchObject({ id: "stem-voice:one", start: 0, end: 3, movable: false });
  });

  it("드래그가 끝난 영상 클립을 목표 시각 순서로 재정렬한다", () => {
    const reordered = reorderVideoByStart(timeline, "two", 0.2);
    expect(reordered.video.map((clip) => clip.id)).toEqual(["two", "one"]);
    expect(timeline.video.map((clip) => clip.id)).toEqual(["one", "two"]);
  });
});
