import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { labelForAction, reorderVideoByStart, timelineToStudioRows } from "../../src/ui/studio/timeline-adapter";

const timeline: Timeline = {
  overlays: [],
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
    expect(rows[2]?.actions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: "one", start: 0, end: 3 },
      { id: "two", start: 3, end: 5 },
    ]);
    expect(rows[3]?.actions[0]).toMatchObject({ id: "source:one", start: 0, end: 3, movable: false });
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
    expect(separated[3]?.actions[0]).toMatchObject({ id: "stem-voice:one", start: 0, end: 3, movable: false });
  });

  it("드래그가 끝난 영상 클립을 목표 시각 순서로 재정렬한다", () => {
    const reordered = reorderVideoByStart(timeline, "two", 0.2);
    expect(reordered.video.map((clip) => clip.id)).toEqual(["two", "one"]);
    expect(timeline.video.map((clip) => clip.id)).toEqual(["one", "two"]);
  });

  it("영상 라벨은 원본 표시 이름을, 효과음 라벨은 라이브러리 제목을 쓴다", () => {
    const withSfx: Timeline = {
      ...timeline,
      video: [{ id: "main-clip", kind: "main", inputId: "source", inStartSec: 0, inEndSec: 3 }],
      sfx: [{ id: "sfx-clip", startSec: 0, file: "u3-library:sfx/laugh/sfx-mum362jc.wav", inStartSec: 0, inEndSec: 1, gain: 1 }],
    };
    expect(labelForAction("main-clip", withSfx, [{ id: "source", kind: "video", file: "3ae415d86090.mov", displayName: "화면 기록 2026-10-24 오후 11.14.18.mov" }])).toBe("화면 기록 2026-10-24 오후 11.14.18.mov");
    expect(labelForAction("sfx-clip", withSfx, [], [{ ref: "u3-library:sfx/laugh/sfx-mum362jc.wav", title: "크게 웃는 소리", category: "웃음" }])).toBe("크게 웃는 소리");
  });

  it("제목 없는 효과음은 종류 이름을 보인다", () => {
    const withSfx: Timeline = { ...timeline, sfx: [{ id: "sfx-clip", startSec: 0, file: "u3-library:sfx/alarm/beep.wav", inStartSec: 0, inEndSec: 1, gain: 1 }] };
    expect(labelForAction("sfx-clip", withSfx, [], [])).toBe("효과음");
  });
  it("겹친 영상 행을 영상 바로 위에 만들고 입력 이름을 라벨로 쓴다", () => {
    const overlay = { id: "overlay-1", kind: "photo" as const, inputId: "photo", startSec: 1, durationSec: 2, x: 0.5, y: 0.5, width: 0.6 };
    const next = { ...timeline, overlays: [[overlay]] };
    expect(timelineToStudioRows(next).map((item) => item.id)).toEqual(["captions", "overlay-0", "video", "source", "voice", "sfx"]);
    expect(labelForAction("overlay-1", next, [{ id: "photo", kind: "photo", file: "photo.jpg", displayName: "사진" }])).toBe("사진");
  });
});
