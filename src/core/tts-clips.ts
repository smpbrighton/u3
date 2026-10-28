import { captionLayersOf, type AudioCache, type Timeline } from "./schema";
import { EMOJI } from "./script-style";
import { plainCaptionText } from "./captions";

import { audioClipLength, cacheKey, clipSpeed } from "./timeline/speed";

export const TTS_SPEAKERS = ["Sohee", "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden", "Ono_Anna"] as const;
export type TtsSpeaker = typeof TTS_SPEAKERS[number];
export const DEFAULT_TTS_SETTINGS = { speaker: "Sohee" as TtsSpeaker, instruct: "" };
export interface TtsItem { captionId: string; text: string }
export interface TtsResult { captionId: string; file: string; durationSec: number; cache?: { key: string; file: string; durationSec: number; version: string } }

export function ttsSettingsOf(settings: Record<string, unknown>) {
  return { speaker: TTS_SPEAKERS.includes(settings.ttsSpeaker as TtsSpeaker) ? settings.ttsSpeaker as TtsSpeaker : DEFAULT_TTS_SETTINGS.speaker,
    instruct: typeof settings.ttsInstruct === "string" ? settings.ttsInstruct : "" };
}

export function ttsText(text: string): string {
  return cleanTtsText(plainCaptionText(text));
}

/** 일반 글의 이모지와 공백만 정리한다. 글자 별표는 다시 해석하지 않는다. */
export function cleanTtsText(text: string): string {
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text);
  return [...segments].filter(({ segment }) => !EMOJI.test(segment) && !segment.includes("\u20E3"))
    .map(({ segment }) => segment).join("").replace(/[\uFE0F\u20E3\u200D\p{Emoji_Modifier}]/gu, "")
    .replace(/\s+/gu, " ").trim();
}

export function ttsItemsFromTimeline(timeline: Timeline): TtsItem[] {
  return (captionLayersOf(timeline)[0]?.main ?? [])
    .map(clip => ({ captionId: clip.id, text: ttsText(clip.text) })).filter(item => item.text.length > 0);
}

export function applyTtsResults(timeline: Timeline, results: readonly TtsResult[]): Timeline {
  const captions = captionLayersOf(timeline)[0]?.main ?? [];
  const clips = results.flatMap(result => {
    const caption = captions.find(clip => clip.id === result.captionId);
    return caption ? [{ id: `tts-${result.captionId}`, file: result.file, startSec: caption.startSec,
      ...(timeline.voice.find(c => c.id === `tts-${result.captionId}`)?.speed !== undefined ? { speed: timeline.voice.find(c => c.id === `tts-${result.captionId}`)!.speed } : {}),
      inStartSec: 0, inEndSec: result.durationSec, gain: 1 }] : [];
  });
  const replacing = new Set(clips.map(clip => clip.id));
  return { ...timeline, voice: [...timeline.voice.filter(clip => !replacing.has(clip.id)), ...clips] };
}

export function ttsOverflow(timeline: Timeline, audioCache?: AudioCache) {
  const captions = captionLayersOf(timeline)[0]?.main ?? [];
  return timeline.voice.filter(clip => clip.id.startsWith("tts-") && captions.some(caption =>
    clip.id === `tts-${caption.id}` && audioClipLength(clip, audioCache?.[cacheKey(clip.file, clipSpeed(clip))]) > caption.endSec - caption.startSec + 0.001));
}
