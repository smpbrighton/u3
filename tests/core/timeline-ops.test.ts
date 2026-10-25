import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { deleteCaptionClip, deleteOverlayClip, deleteVideoClip, moveAudioClip, moveCaptionClip, moveOverlayClip, moveVideoClip, splitOverlayClip, splitVideoClip, trimAudioClip, trimCaptionClip, trimOverlayClip, trimVideoClip, videoStartTimes } from "../../src/core/timeline/ops";

const empty = (): Timeline => ({ video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const base = (): Timeline => ({ ...empty(), video: [
  { id: "v1", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 4 },
  { id: "photo", kind: "main", inputId: "p", durationSec: 3 },
  { id: "meme", kind: "meme", memeId: "m", durationSec: 2 },
] });

describe("timeline ops", () => {
  it("영상 자르기는 원본 구간을 나누고 입력을 바꾸지 않는다", () => {
    const timeline = base();
    const result = splitVideoClip(timeline, "v1", 1.5);
    expect(result.video.slice(0, 2)).toEqual([
      { id: "v1-a", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 1.5 },
      { id: "v1-b", kind: "main", inputId: "in", inStartSec: 1.5, inEndSec: 4 },
    ]);
    expect(timeline.video[0]).toMatchObject({ inStartSec: 0, inEndSec: 4 });
  });
  it("묶인 영상을 자른 조각은 묶음을 유지하고 바깥 전환만 보존한다", () => {
    const grouped: Timeline = { ...base(), video: [{ id: "g", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 4, groupId: "group-a", startTransition: { kind: { kind: "dissolve" }, durationSec: 0.5 }, endTransition: { kind: { kind: "zoom" }, durationSec: 0.5 } }] };
    const split = splitVideoClip(grouped, "g", 2);
    expect(split.video).toEqual([
      { id: "g-a", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 2, groupId: "group-a", startTransition: { kind: { kind: "dissolve" }, durationSec: 0.5 }, endTransition: { kind: { kind: "none" }, durationSec: 0.5 } },
      { id: "g-b", kind: "main", inputId: "in", inStartSec: 2, inEndSec: 4, groupId: "group-a", startTransition: { kind: { kind: "none" }, durationSec: 0.5 }, endTransition: { kind: { kind: "zoom" }, durationSec: 0.5 } },
    ]);
  });
  it("사진과 짤은 길이를 나누고 트림·이동 뒤 시작 시각을 다시 계산한다", () => {
    let timeline = splitVideoClip(base(), "photo", 5.5);
    expect(timeline.video.slice(1, 3).map((clip) => "durationSec" in clip ? clip.durationSec : 0)).toEqual([1.5, 1.5]);
    timeline = trimVideoClip(timeline, "photo-a", "end", 4.5);
    timeline = moveVideoClip(timeline, "meme", 0);
    expect(videoStartTimes(timeline).meme).toBe(0);
    expect(timeline.video.find((clip) => clip.id === "photo-a")).toMatchObject({ durationSec: 0.5 });
  });
  it("트림은 영상 원본 길이를 넘지 않고 지우면 뒤쪽 클립을 당긴다", () => {
    expect(() => trimVideoClip(base(), "v1", "end", 3.5, 3)).toThrow(/원본 길이/u);
    const after = deleteVideoClip(base(), "photo");
    expect(videoStartTimes(after)).toEqual({ v1: 0, meme: 4 });
  });
  it("영상·사진·짤은 원본 한계와 길이 범위 안에서 다시 늘릴 수 있다", () => {
    const timeline: Timeline = { ...empty(), video: [
      { id: "v", kind: "main", inputId: "in", inStartSec: 1, inEndSec: 4 },
      { id: "photo", kind: "main", inputId: "p", durationSec: 2 },
      { id: "meme", kind: "meme", memeId: "m", durationSec: 2 },
    ] };
    const videoExtended = trimVideoClip(timeline, "v", "start", -0.5, 5);
    expect(videoExtended.video[0]).toMatchObject({ inStartSec: 0.5, inEndSec: 4 });
    const photoExtended = trimVideoClip(timeline, "photo", "end", 6.5);
    expect(photoExtended.video[1]).toMatchObject({ durationSec: 3.5 });
    const memeExtended = trimVideoClip(timeline, "meme", "end", 9, 10);
    expect(memeExtended.video[2]).toMatchObject({ durationSec: 4 });
    expect(() => trimVideoClip(timeline, "meme", "end", 9.1, 10)).toThrow(/0.5~4초/u);
    expect(() => trimVideoClip(timeline, "photo", "end", 2.9)).toThrow(/0보다 커야/u);
    const shortMeme: Timeline = { ...empty(), video: [{ id: "short-meme", kind: "meme", memeId: "m", durationSec: 0.8 }] };
    expect(() => splitVideoClip(shortMeme, "short-meme", 0.4)).toThrow(/0.5~4초/u);
  });
  it("자막·오디오 클립은 독립적으로 이동·트림·삭제한다", () => {
    const timeline: Timeline = { ...empty(), captions: [{ id: "c", startSec: 1, endSec: 3, text: "말" }], voice: [{ id: "a", startSec: 2, file: "v.wav", inStartSec: 0, inEndSec: 4, gain: 1 }] };
    expect(moveCaptionClip(timeline, "c", 4).captions[0]).toMatchObject({ startSec: 4, endSec: 6 });
    expect(trimCaptionClip(timeline, "c", "start", 1.5).captions[0]?.startSec).toBe(1.5);
    expect(moveAudioClip(timeline.voice, "a", 5)[0]?.startSec).toBe(5);
    expect(trimAudioClip(timeline.voice, "a", "start", 3, 5)[0]).toMatchObject({ startSec: 3, inStartSec: 1 });
    expect(trimAudioClip(timeline.voice, "a", "end", 8, 10)[0]).toMatchObject({ inEndSec: 6 });
    expect(() => trimAudioClip(timeline.voice, "a", "end", 13, 10)).toThrow(/파일 길이/u);
    const extendable: Timeline["voice"] = [{ id: "long", startSec: 2, file: "v.wav", inStartSec: 1, inEndSec: 4, gain: 1 }];
    expect(trimAudioClip(extendable, "long", "start", 1, 5)[0]).toMatchObject({ startSec: 1, inStartSec: 0 });
    expect(deleteCaptionClip(timeline.captions, "c")).toEqual([]);
  });
  it("겹친 영상을 옮기고 양쪽을 트림하고 자르며 지운다", () => {
    const timeline: Timeline = { ...empty(), video: [{ id: "main", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 10 }], overlays: [[{ id: "o", kind: "video", inputId: "in", startSec: 1, inStartSec: 2, inEndSec: 6, x: 0.5, y: 0.5, width: 0.6 }]] };
    expect(moveOverlayClip(timeline, "o", 2).overlays[0]?.[0]?.startSec).toBe(2);
    expect(trimOverlayClip(timeline, "o", "start", 2).overlays[0]?.[0]).toMatchObject({ startSec: 2, inStartSec: 3, inEndSec: 6 });
    expect(trimOverlayClip(timeline, "o", "end", 4).overlays[0]?.[0]).toMatchObject({ startSec: 1, inStartSec: 2, inEndSec: 5 });
    expect(splitOverlayClip(timeline, "o", 3).overlays[0]).toMatchObject([{ id: "o-a", inEndSec: 4 }, { id: "o-b", startSec: 3, inStartSec: 4 }]);
    expect(deleteOverlayClip(timeline, "o").overlays).toEqual([]);
    expect(() => moveOverlayClip(timeline, "o", 7)).toThrow();
  });
});
