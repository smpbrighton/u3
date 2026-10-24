import { buildCaptionChunks, type CaptionOptions } from "./captions";
import type { Measurer } from "./measure";
import type { TextClip, Timeline, VideoClip, WordStamp } from "./schema";
import { clipDuration } from "./timeline/ops";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function seconds(offsets: unknown, field: "from" | "to"): number | undefined {
  const value = object(offsets)[field];
  return typeof value === "number" && Number.isFinite(value) ? value / 1000 : undefined;
}

/** `whisper-cli -ojf --vad -ml 1 -sow` 출력에서 입력 기준 단어 시각을 읽는다. */
export function parseWhisperOutput(value: unknown): WordStamp[] {
  const transcription = object(value).transcription;
  if (!Array.isArray(transcription)) throw new TypeError("whisper JSON에 transcription 배열이 없습니다");
  const words: WordStamp[] = [];
  for (const rawSegment of transcription) {
    const segment = object(rawSegment);
    const segmentStart = seconds(segment.offsets, "from");
    if (segmentStart === undefined || !Array.isArray(segment.tokens)) continue;
    for (const rawToken of segment.tokens) {
      const token = object(rawToken);
      const text = typeof token.text === "string" ? token.text.trim() : "";
      const startOffset = seconds(token.offsets, "from");
      const endOffset = seconds(token.offsets, "to");
      if (!text || /^\[_.+_\]$/u.test(text) || startOffset === undefined || endOffset === undefined) continue;
      const start = segmentStart + startOffset;
      const end = segmentStart + endOffset;
      if (end > start) words.push({ text, start, end });
    }
  }
  return words;
}

export interface TranscriptClip extends Pick<VideoClip, "id" | "kind"> {
  inputId: string;
  inStartSec: number;
  inEndSec: number;
}

export interface TranscriptResult {
  words: WordStamp[];
  captions: TextClip[];
  replaced: TextClip[];
  timeline: Timeline;
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
        .map((word) => ({ text: word.text, start: timelineStart + word.start - clip.inStartSec, end: timelineStart + word.end - clip.inStartSec }));
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
    text: chunk.lines.map((line) => line.text).join("\n"),
  }));
  const replaced = timeline.captions.filter((caption) => speechRanges.some((range) => caption.startSec < range.endSec && caption.endSec > range.startSec));
  const replacedIds = new Set(replaced.map((caption) => caption.id));
  const nextTimeline: Timeline = { ...timeline, captions: [...timeline.captions.filter((caption) => !replacedIds.has(caption.id)), ...captions] };
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
