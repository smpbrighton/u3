import { describe, expect, it } from "vitest";
import { CAPTION_HIGHLIGHT_DEFAULT, DEFAULT_CAPTION_STYLE, type Timeline } from "../../src/core/schema";
import { effectiveCaptionStyle, timelineToRender } from "../../src/core/timeline/to-render";

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
  it("047 영상·오버레이·양쪽 전환은 각 배속과 원본 좌표를 사용한다", () => {
    const t: Timeline = { ...timeline, video: [
      { id: "left", kind: "main", inputId: "in1", inStartSec: 2, inEndSec: 6, speed: 2, endTransition: { kind: { kind: "dissolve" }, durationSec: 0.4 } },
      { id: "right", kind: "main", inputId: "in2", inStartSec: 4, inEndSec: 6, speed: 0.5 },
    ], overlays: [[{ id: "o", kind: "video", inputId: "in1", startSec: 0.11, inStartSec: 2, inEndSec: 6, speed: 2, x: 0.5, y: 0.5, width: 0.6 }]] };
    const r = timelineToRender(t);
    expect(r.transitions[0]).toMatchObject({ fromPlaybackRate: 1, toPlaybackRate: 0.25, fromSourceStartFrame: 168, toSourceStartFrame: 120 });
    expect(r.video[1]).toMatchObject({ playbackRate: 0.5, sourceStartFrame: 123 });
    expect(r.overlay[0]).toMatchObject({ playbackRate: 2, durationInFrames: 60, sourceStartFrame: 60 });
    expect(r.audio.filter(a => ["source", "stem-voice", "stem-bg"].includes(a.track))).toEqual([]);
    const edges = timelineToRender({ ...t, video: [{ ...t.video[0]!, startTransition: { kind: { kind: "dissolve" }, durationSec: 0.4 } }] });
    expect(edges.transitions.every(e => e.fromPlaybackRate === 2 && e.toPlaybackRate === 2)).toBe(true);
  });
  it("047 캐시 WAV는 세 영상 소리와 음성에 동일하게 적용하고 추가 배속을 쓰지 않는다", () => {
    const t: Timeline = { ...timeline, video: timeline.video.map(c => "inStartSec" in c ? { ...c, speed: 2 } : c), voice: [{ ...timeline.voice[0]!, speed: 2 }] };
    const cache = { "in1:2": { file: "cache/audio/1.wav", durationSec: 5, version: "v1" }, "in2:2": { file: "cache/audio/2.wav", durationSec: 5, version: "v2" }, "voice.wav:2": { file: "cache/audio/voice.wav", durationSec: 0.99, version: "v3" } };
    const r = timelineToRender(t, undefined, cache);
    expect(r.audio.find(a => a.id === "v1-source")).toMatchObject({ file: cache["in1:2"].file, sourceStartFrame: 15, durationInFrames: 30 });
    for (const id of ["v2-voice", "v2-bg"]) expect(r.audio.find(a => a.id === id)).toMatchObject({ file: cache["in2:2"].file, sourceStartFrame: 30, durationInFrames: 30 });
    expect(r.audio.find(a => a.id === "voice")).toMatchObject({ file: cache["voice.wav:2"].file, sourceStartFrame: 15, durationInFrames: 15 });
    expect(r.audio.find(a => a.id === "voice")).not.toHaveProperty("playbackRate");
    expect(timelineToRender(t).audio.some(a => a.id === "voice")).toBe(false);
  });
  it("클립 색·배율을 레이어 위에 합치고 단어 색 기본값을 둔다", () => {
    expect(effectiveCaptionStyle(DEFAULT_CAPTION_STYLE)).toEqual({ ...DEFAULT_CAPTION_STYLE, highlightColor: CAPTION_HIGHLIGHT_DEFAULT });
    expect(effectiveCaptionStyle(DEFAULT_CAPTION_STYLE, { color: "#112233", sizeScale: 1.5, highlightColor: "#445566" })).toMatchObject({ color: "#112233", mainSize: 84, subSize: 60, highlightColor: "#445566", barOpacity: 0.62 });
    expect(DEFAULT_CAPTION_STYLE.mainSize).toBe(56);
    const result = timelineToRender({ ...timeline, captions: [{ ...timeline.captions[0]!, style: { color: "#123456", sizeScale: 2, animation: "rise" } }] });
    expect(result.captions[0]).toMatchObject({ style: { color: "#123456", mainSize: 112, subSize: 80 }, clipStyle: { sizeScale: 2 }, animation: "rise", clipStartSec: 1 });
    expect(timelineToRender(timeline).captions[0]).toMatchObject({ clipStartSec: 1, style: { color: "#FFFFFF", mainSize: 56 } });
  });
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
    expect(timelineToRender(main).audio).toContainEqual(expect.objectContaining({ id: "upper-source", track: "source", startFrame: 30, durationInFrames: 60, sourceStartFrame: 120, inputId: "in3", volume: 0.7 }));
  });
});

describe("가변 오버레이 트랙 렌더 순서", () => {
  it("영상 2부터 6까지 위쪽 순서와 layer 번호를 보존한다", () => {
    const timelineForLayers: Timeline = { ...timeline, video: [{ id: "base", kind: "main", inputId: "in", durationSec: 5 }], overlays: [0, 1, 2, 3, 4].map((layer) => [{ id: `o${layer + 2}`, memeId: `m${layer + 2}`, startSec: 0, durationSec: 1, x: 0.5, y: 0.5, width: 0.6 }]) };
    const rendered = timelineToRender(timelineForLayers);
    expect(rendered.overlay.map((item) => [item.id, item.layer])).toEqual([["o2", 0], ["o3", 1], ["o4", 2], ["o5", 3], ["o6", 4]]);
  });
});

describe("짧아진 클립 전환 렌더 길이", () => {
  it("저장된 효과 길이가 클립 절반을 넘으면 렌더 효과를 clamp한다", () => {
    const shortTimeline: Timeline = { ...timeline, video: [{ id: "short", kind: "main", inputId: "in", durationSec: 0.4, startTransition: { kind: { kind: "dissolve" }, durationSec: 2 } }], overlays: [[{ id: "over", memeId: "m", startSec: 0, durationSec: 0.4, x: 0.5, y: 0.5, width: 0.6, startTransition: { kind: { kind: "dissolve" }, durationSec: 2 } }]] };
    const render = timelineToRender(shortTimeline);
    expect(render.transitions[0]?.durationInFrames).toBe(6);
    expect(render.overlay[0]?.startTransition?.durationSec).toBe(0.2);
  });
});

describe("047 측정한 오디오의 절대 프레임 경계", () => {
  it("시작 시각을 먼저 반올림해서 측정 길이의 마지막 프레임을 잃지 않는다", () => {
    const t: Timeline = { ...timeline, video: [], overlays: [], captions: [], sfx: [], voice: [{ id: "a", file: "a.wav", startSec: 0.014, inStartSec: 0, inEndSec: 1, speed: 2, gain: 1 }] };
    const rendered = timelineToRender(t, undefined, { "a.wav:2": { file: "cache/audio/a.wav", durationSec: 0.483, version: "v" } });
    expect(rendered.audio[0]).toMatchObject({ startFrame: 0, durationInFrames: 15 });
    expect(rendered.durationInFrames).toBe(15);
  });
});
