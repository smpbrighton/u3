import { buildCaptionChunks, escapeCaptionStars, type CaptionOptions } from "./captions";
import type { Measurer } from "./measure";
import { captionLayersOf, withCaptionLayers, type AudioClip, type TextClip, type Timeline, type WordStamp } from "./schema";
import { clipDuration } from "./timeline/ops";

import { timelineOffsetOf } from "./timeline/speed";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function seconds(offsets: unknown, field: "from" | "to"): number | undefined {
  const value = object(offsets)[field];
  return typeof value === "number" && Number.isFinite(value) ? value / 1000 : undefined;
}

/** `whisper-cli -ojf --vad -ml 1 -sow` 출력에서 segment 단위 입력 시각을 읽는다. */
export function parseWhisperOutput(value: unknown): WordStamp[] {
  const transcription = object(value).transcription;
  if (!Array.isArray(transcription)) throw new TypeError("whisper JSON에 transcription 배열이 없습니다");
  const words: WordStamp[] = [];
  for (const rawSegment of transcription) {
    const segment = object(rawSegment);
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    const start = seconds(segment.offsets, "from");
    const end = seconds(segment.offsets, "to");
    if (!text || /^\[_.*_\]$/u.test(text) || start === undefined || end === undefined || end <= start) continue;
    words.push({ text, start, end });
  }
  return words;
}

export interface TranscriptResult {
  words: WordStamp[];
  captions: TextClip[];
  replaced: TextClip[];
  timeline: Timeline;
}

/** 음성 clip의 원본 구간 안에 있는 단어 시각을 타임라인 시각으로 옮긴다. */
export function wordsForAudioClip(clip: AudioClip, sourceWords: readonly WordStamp[]): WordStamp[] {
  return sourceWords
    .filter((word) => word.start >= clip.inStartSec && word.start < clip.inEndSec && word.end <= clip.inEndSec)
    .map((word) => ({
      text: word.text,
      start: clip.startSec + timelineOffsetOf(clip, word.start),
      end: clip.startSec + timelineOffsetOf(clip, word.end),
    }));
}

export function captionsFromTranscript(
  timeline: Timeline,
  inputId: string,
  sourceWords: readonly WordStamp[],
  measurer: Measurer,
  captionOptions: CaptionOptions,
  idPrefix = "transcript",
): TranscriptResult {
  let timelineStart = 0;
  const mapped: WordStamp[] = [];
  const speechRanges: { startSec: number; endSec: number }[] = [];
  for (const clip of timeline.video) {
    const duration = clipDuration(clip);
    const isSourceVideo = clip.kind === "main" && "inStartSec" in clip && clip.inputId === inputId;
    if (isSourceVideo) {
      const selected = sourceWords
        .filter((word) => word.start >= clip.inStartSec && word.start < clip.inEndSec && word.end <= clip.inEndSec)
        .map((word) => ({ text: word.text, start: timelineStart + timelineOffsetOf(clip, word.start), end: timelineStart + timelineOffsetOf(clip, word.end) }));
      if (selected.length) {
        mapped.push(...selected);
        speechRanges.push({ startSec: selected[0]!.start, endSec: selected.at(-1)!.end });
      }
    }
    timelineStart += duration;
  }

  const chunks = buildCaptionChunks(mapped, measurer, captionOptions);
  const captions = chunks.map((chunk, index) => ({
    id: `${idPrefix}-${index}`,
    startSec: chunk.startSec,
    endSec: Math.max(chunk.startSec + 0.01, chunk.endSec),
    text: escapeCaptionStars(chunk.lines.map((line) => line.text).join("\n")),
  }));
  const layers = captionLayersOf(timeline);
  const main = layers[0]?.main ?? [];
  const replaced = main.filter((caption) => speechRanges.some((range) => caption.startSec < range.endSec && caption.endSec > range.startSec));
  const replacedIds = new Set(replaced.map((caption) => caption.id));
  const nextMain = [...main.filter((caption) => !replacedIds.has(caption.id)), ...captions];
  const nextTimeline: Timeline = withCaptionLayers(timeline, layers.map((layer, index) => index === 0 ? { ...layer, main: nextMain } : layer));
  return { words: mapped, captions, replaced, timeline: nextTimeline };
}

export function transcriptForTimeline(
  timeline: Timeline,
  inputId: string,
  whisperJson: unknown,
  measurer: Measurer,
  captionOptions: CaptionOptions,
  idPrefix?: string,
): TranscriptResult {
  return captionsFromTranscript(timeline, inputId, parseWhisperOutput(whisperJson), measurer, captionOptions, idPrefix);
}
