import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPTION_STYLE, CAPTION_MAX_LINE_WIDTH, CAPTION_MAX_LINES } from "../../src/core/layout";
import { captionsFromTranscript, parseWhisperOutput, transcriptForTimeline, wordsForAudioClip } from "../../src/core/transcript";
import type { AudioClip, Timeline } from "../../src/core/schema";
import type { Measurer } from "../../src/core/measure";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/whisper-output.json", import.meta.url), "utf8")) as unknown;
const measurer: Measurer = { width: (text) => [...text].length, rawWidth: (text) => [...text].length, margin: 0 };
const options = { style: CAPTION_STYLE, maxWidth: CAPTION_MAX_LINE_WIDTH, maxLines: CAPTION_MAX_LINES } as const;
const blank = (): Timeline => ({ video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });

describe("whisper transcript", () => {
  it("047 원본 단어 시각은 영상과 음성 배속으로 한 번 변환한다", () => {
    const words = [{ text: "배속", start: 3, end: 4 }];
    const clip = { id: "a", startSec: 5, file: "a.wav", inStartSec: 2, inEndSec: 6, gain: 1, speed: 2 };
    expect(wordsForAudioClip(clip, words)).toEqual([{ text: "배속", start: 5.5, end: 6 }]);
    const t = { ...blank(), video: [{ id: "v", kind: "main" as const, inputId: "i", inStartSec: 2, inEndSec: 6, speed: 2 }] };
    expect(captionsFromTranscript(t, "i", words, measurer, options).words).toEqual([{ text: "배속", start: 0.5, end: 1 }]);
  });
  it("받아 적기 결과의 별표를 강조로 해석하지 않도록 이스케이프해 저장한다", () => {
    const base: Timeline = { ...blank(), video: [{ id: "v", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 2 }] };
    const result = captionsFromTranscript(base, "in", [{ text: "*별표*", start: 0, end: 1 }], measurer, options);
    expect(result.captions[0]?.text).toBe(String.raw`\*별표\*`);
    expect(result.timeline.captions[0]?.text).toBe(String.raw`\*별표\*`);
  });
  it("실제 whisper JSON fixture에서 입력 기준 단어 시각을 읽는다", () => {
    const words = parseWhisperOutput(fixture);
    expect(words[0]?.text).toBe("오늘은");
    expect(words[0]?.start).toBeCloseTo(1, 8);
    expect(words[0]?.end).toBeCloseTo(1.32, 8);
    expect(words[1]).toMatchObject({ text: "제가", start: 1.32, end: 1.56 });
    expect(words.find((word) => word.text === "동네")).toMatchObject({ start: 2.13, end: 2.28 });
    expect(words.some((word) => word.text === "동" || word.text === "네")).toBe(false);
    expect(words.every((word) => word.end > word.start)).toBe(true);
  });
  it("음성 클립의 입력 기준 단어를 클립 시각으로 옮기고 구간 밖 단어를 버린다", () => {
    const words = parseWhisperOutput(fixture);
    const clip: AudioClip = { id: "voice-clip", startSec: 10, file: "voice.wav", inStartSec: 1, inEndSec: 2.28, gain: 1 };
    const mapped = wordsForAudioClip(clip, words);
    expect(mapped[0]).toMatchObject({ text: "오늘은", start: 10, end: 10.32 });
    expect(mapped[1]).toMatchObject({ text: "제가", start: 10.32, end: 10.56 });
    expect(mapped.at(-1)?.text).toBe("동네");
    expect(mapped.at(-1)?.start).toBeCloseTo(11.13, 8);
    expect(mapped.at(-1)?.end).toBeCloseTo(11.28, 8);
    expect(mapped.some((word) => word.start < 10 || word.end > 11.28)).toBe(false);
  });
  it("자른 클립과 재정렬된 클립에 시각을 옮기고 클립 밖 단어를 버린다", () => {
    const timeline = { ...blank(), video: [
      { id: "later-first", kind: "main" as const, inputId: "in", inStartSec: 2, inEndSec: 3 },
      { id: "cut", kind: "main" as const, inputId: "in", inStartSec: 1, inEndSec: 1.55 },
    ] };
    const result = transcriptForTimeline(timeline, "in", fixture, measurer, options);
    expect(result.words.map((word) => word.text)).toContain("오늘은");
    expect(result.words[0]!.start).toBeLessThan(1);
    expect(result.words.at(-1)!.end).toBeLessThan(1.56);
    expect(result.words.some((word) => word.text === "제가")).toBe(false);
    expect(result.captions.length).toBeGreaterThan(0);
  });
  it("말소리와 겹치는 자막만 교체 대상으로 돌려주고 다른 구간은 유지한다", () => {
    const timeline: Timeline = {
      ...blank(),
      video: [{ id: "clip", kind: "main", inputId: "in", inStartSec: 1, inEndSec: 1.56 }],
      captions: [
        { id: "overlap", startSec: 0, endSec: 0.5, text: "old" },
        { id: "unrelated", startSec: 5, endSec: 6, text: "keep" },
      ],
    };
    const result = captionsFromTranscript(timeline, "in", parseWhisperOutput(fixture), measurer, options);
    expect(result.replaced.map((clip) => clip.id)).toEqual(["overlap"]);
    expect(result.timeline.captions.some((clip) => clip.id === "unrelated")).toBe(true);
    expect(result.timeline.captions.some((clip) => clip.id === "overlap")).toBe(false);
  });
});
