import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPTION_STYLE, CAPTION_MAX_LINE_WIDTH, CAPTION_MAX_LINES } from "../../src/core/layout";
import { captionsFromTranscript, parseWhisperOutput, transcriptForTimeline } from "../../src/core/transcript";
import type { Timeline } from "../../src/core/schema";
import type { Measurer } from "../../src/core/measure";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/whisper-output.json", import.meta.url), "utf8")) as unknown;
const measurer: Measurer = { width: (text) => [...text].length, rawWidth: (text) => [...text].length, margin: 0 };
const options = { style: CAPTION_STYLE, maxWidth: CAPTION_MAX_LINE_WIDTH, maxLines: CAPTION_MAX_LINES } as const;
const blank = (): Timeline => ({ video: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });

describe("whisper transcript", () => {
  it("실제 whisper JSON fixture에서 입력 기준 단어 시각을 읽는다", () => {
    const words = parseWhisperOutput(fixture);
    expect(words[0]?.text).toBe("오늘은");
    expect(words[0]?.start).toBeCloseTo(1.04, 8);
    expect(words[0]?.end).toBeCloseTo(1.36, 8);
    expect(words.every((word) => word.end > word.start)).toBe(true);
  });
  it("자른 클립과 재정렬된 클립에 시각을 옮기고 클립 밖 단어를 버린다", () => {
    const timeline = { ...blank(), video: [
      { id: "later-first", kind: "main" as const, inputId: "in", inStartSec: 2, inEndSec: 3 },
      { id: "cut", kind: "main" as const, inputId: "in", inStartSec: 1, inEndSec: 1.56 },
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
