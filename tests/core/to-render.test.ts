import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";

const timeline: Timeline = {
  overlays: [],
  video: [
    { id: "v1", kind: "main", inputId: "in1", inStartSec: 1, inEndSec: 3 },
    { id: "v2", kind: "main", inputId: "in2", inStartSec: 2, inEndSec: 4 },
    { id: "m1", kind: "meme", memeId: "m", durationSec: 1 },
  ],
  captions: [{ id: "c", startSec: 1, endSec: 2, text: "자막" }],
  voice: [{ id: "voice", startSec: 0.5, file: "voice.wav", inStartSec: 1, inEndSec: 2, gain: 0.5 }],
  sfx: [{ id: "sfx", startSec: 2, file: "sfx.wav", inStartSec: 0, inEndSec: 0.5, gain: 1 }],
  audio: {
    source: { gain: 0.8, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1.2, muted: true },
    stems: { in2: { voice: { gain: 1.2, muted: false }, bg: { gain: 0.7, muted: true } } },
  },
};

describe("timelineToRender", () => {
  it("30fps 시퀀스와 자막·오디오 프레임을 만들고 순서를 반영한다", () => {
    const render = timelineToRender(timeline);
    expect(render.fps).toBe(30);
    expect(render.video.map((item) => [item.startFrame, item.durationInFrames])).toEqual([[0, 60], [60, 60], [120, 30]]);
    expect(render.video[0]).toMatchObject({ sourceStartFrame: 30 });
    expect(render.captions[0]).toMatchObject({ startFrame: 30, durationInFrames: 30 });
    expect(render.durationInFrames).toBe(150);
  });
  it("트랙 볼륨·음소거와 분리 트랙을 적용하고 원본 소리를 대체한다", () => {
    const render = timelineToRender(timeline);
    expect(render.audio).toContainEqual(expect.objectContaining({ id: "v1-source", track: "source", volume: 0.8, sourceStartFrame: 30 }));
    expect(render.audio).not.toContainEqual(expect.objectContaining({ id: "v2-source" }));
    expect(render.audio).toContainEqual(expect.objectContaining({ id: "v2-voice", track: "stem-voice", volume: 1.2 }));
    expect(render.audio).toContainEqual(expect.objectContaining({ id: "v2-bg", track: "stem-bg", volume: 0 }));
    expect(render.audio).toContainEqual(expect.objectContaining({ id: "voice", volume: 0.5 }));
    expect(render.audio).toContainEqual(expect.objectContaining({ id: "sfx", volume: 0 }));
  });
  it("겹친 짤은 본 영상 구간 위에 배치하고 음성 레이어를 추가하지 않는다", () => {
    const render = timelineToRender({ ...timeline, overlays: [[{ id: "o", memeId: "m", startSec: 1, durationSec: 2, x: 0.5, y: 0.5, width: 0.6 }]] });
    expect(render.overlay).toEqual([{ id: "o", kind: "meme", startFrame: 30, durationInFrames: 60, memeId: "m", layer: 0, x: 0.5, y: 0.5, width: 0.6 }]);
    expect(render.audio.map((item) => item.id)).not.toContain("o-audio");
  });
  it("렌더는 낮은 층부터 높은 층 순서로 클립을 낸다", () => {
    const clip = (id: string) => ({ id, memeId: id, startSec: 1, durationSec: 1, x: 0.5, y: 0.5, width: 0.6 });
    expect(timelineToRender({ ...timeline, overlays: [[clip("bottom")], [clip("top")]] }).overlay.map((item) => [item.id, item.layer])).toEqual([["bottom", 0], ["top", 1]]);
  });
  it("영상 2 원본은 원본 소리 설정과 원본 구간을 따라 소리 낸다", () => {
    const main: Timeline = { ...timeline, video: [{ id: "main", kind: "main", inputId: "in1", inStartSec: 0, inEndSec: 5 }], overlays: [[{ id: "upper", kind: "video", inputId: "in3", startSec: 1, inStartSec: 4, inEndSec: 6, x: 0.5, y: 0.5, width: 0.6 }]], audio: { ...timeline.audio, source: { gain: 0.7, muted: false } } };
    expect(timelineToRender(main).audio).toContainEqual(expect.objectContaining({ id: "upper-source", track: "source", startFrame: 30, durationInFrames: 60, sourceStartFrame: 120, inputId: "in2", volume: 0.7 }));
  });
});
