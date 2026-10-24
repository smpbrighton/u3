import type { Timeline } from "../../core/schema";
import { clipDuration, videoStartTimes } from "../../core/timeline/ops";

export interface StudioAction {
  id: string;
  start: number;
  end: number;
  effectId: string;
  flexible: boolean;
  movable: boolean;
}

export interface StudioRow {
  id: string;
  actions: StudioAction[];
  rowHeight: number;
}

const row = (id: string, actions: StudioAction[], rowHeight = 54): StudioRow => ({ id, actions, rowHeight });
const action = (id: string, start: number, end: number, effectId: string, movable = true): StudioAction => ({ id, start, end, effectId, flexible: movable, movable });

export function timelineToStudioRows(timeline: Timeline): StudioRow[] {
  const starts = videoStartTimes(timeline);
  const videoActions = timeline.video.map((clip) => action(clip.id, starts[clip.id]!, starts[clip.id]! + clipDuration(clip), clip.kind));
  const sourceActions = timeline.video.flatMap((clip) => {
    if (clip.kind !== "main" || !("inStartSec" in clip) || timeline.audio.stems?.[clip.inputId]) return [];
    const start = starts[clip.id]!;
    return [action(`source:${clip.id}`, start, start + clipDuration(clip), "source", false)];
  });
  const stemVoice = timeline.video.flatMap((clip) => {
    if (clip.kind !== "main" || !("inStartSec" in clip) || !timeline.audio.stems?.[clip.inputId]) return [];
    const start = starts[clip.id]!;
    return [action(`stem-voice:${clip.id}`, start, start + clipDuration(clip), "stem-voice", false)];
  });
  const stemBg = timeline.video.flatMap((clip) => {
    if (clip.kind !== "main" || !("inStartSec" in clip) || !timeline.audio.stems?.[clip.inputId]) return [];
    const start = starts[clip.id]!;
    return [action(`stem-bg:${clip.id}`, start, start + clipDuration(clip), "stem-bg", false)];
  });
  return [
    row("captions", timeline.captions.map((clip) => action(clip.id, clip.startSec, clip.endSec, "caption"))),
    row("video", videoActions, 64),
    row("source", sourceActions),
    row("stem-voice", stemVoice),
    row("stem-bg", stemBg),
    row("voice", timeline.voice.map((clip) => action(clip.id, clip.startSec, clip.startSec + clip.inEndSec - clip.inStartSec, "voice"))),
    row("sfx", timeline.sfx.map((clip) => action(clip.id, clip.startSec, clip.startSec + clip.inEndSec - clip.inStartSec, "sfx"))),
  ];
}

export function reorderVideoByStart(timeline: Timeline, clipId: string, startSec: number): Timeline {
  const sourceStart = videoStartTimes(timeline);
  const current = timeline.video.findIndex((clip) => clip.id === clipId);
  if (current < 0) throw new Error(`영상 클립을 찾을 수 없습니다: ${clipId}`);
  const target = timeline.video.filter((clip) => clip.id !== clipId)
    .filter((clip) => sourceStart[clip.id]! + clipDuration(clip) / 2 <= startSec).length;
  const video = [...timeline.video];
  const [clip] = video.splice(current, 1);
  video.splice(Math.max(0, Math.min(target, video.length)), 0, clip!);
  return { ...timeline, video };
}
