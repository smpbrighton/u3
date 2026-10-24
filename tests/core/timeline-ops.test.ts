import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { deleteCaptionClip, deleteVideoClip, moveAudioClip, moveCaptionClip, moveVideoClip, splitVideoClip, trimAudioClip, trimCaptionClip, trimVideoClip, videoStartTimes } from "../../src/core/timeline/ops";

const empty = (): Timeline => ({ video: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
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
  it("자막·오디오 클립은 독립적으로 이동·트림·삭제한다", () => {
    const timeline: Timeline = { ...empty(), captions: [{ id: "c", startSec: 1, endSec: 3, text: "말" }], voice: [{ id: "a", startSec: 2, file: "v.wav", inStartSec: 0, inEndSec: 4, gain: 1 }] };
    expect(moveCaptionClip(timeline, "c", 4).captions[0]).toMatchObject({ startSec: 4, endSec: 6 });
    expect(trimCaptionClip(timeline, "c", "start", 1.5).captions[0]?.startSec).toBe(1.5);
    expect(moveAudioClip(timeline.voice, "a", 5)[0]?.startSec).toBe(5);
    expect(trimAudioClip(timeline.voice, "a", "start", 3)[0]).toMatchObject({ startSec: 3, inStartSec: 1 });
    expect(deleteCaptionClip(timeline.captions, "c")).toEqual([]);
  });
});
