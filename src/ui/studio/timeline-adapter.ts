import type { ClipTransitionInput, Input, Timeline } from "../../core/schema";
import { inputDisplayName } from "../../core/input";
import { clipDuration, videoStartTimes } from "../../core/timeline/ops";
import { sfxLane, sfxRowId } from "../../core/timeline/sfx-lanes";
import { TRACK_ROW_HEIGHT } from "./timeline-layout";

export interface StudioAction {
  id: string;
  start: number;
  end: number;
  effectId: string;
  flexible: boolean;
  movable: boolean;
  groupId?: string;
  groupBefore?: boolean;
  groupAfter?: boolean;
  startTransition?: ClipTransitionInput;
  endTransition?: ClipTransitionInput;
}

export interface StudioRow {
  id: string;
  name?: string;
  actions: StudioAction[];
  rowHeight: number;
}

export interface SfxLabel { ref: string; title?: string; category?: string }
export interface MemeLabel { id: string; description?: string }

export function labelForAction(id: string, timeline: Timeline, inputs: readonly Input[] = [], sfxItems: readonly SfxLabel[] = [], memes: readonly MemeLabel[] = []): string {
  const caption = timeline.captions.find(item => item.id === id);
  if (caption) return caption.text;
  const video = timeline.video.find(item => item.id === id);
  if (video) {
    if (video.kind === "meme") return video.memeId;
    const input = inputs.find(item => item.id === video.inputId);
    return input ? inputDisplayName(input) : video.inputId;
  }
  const overlay = timeline.overlays.flat().find(item => item.id === id);
  if (overlay) {
    if ("memeId" in overlay) return memes.find((item) => item.id === overlay.memeId)?.description ?? overlay.memeId;
    const input = inputs.find(item => item.id === overlay.inputId);
    return input ? inputDisplayName(input) : overlay.inputId;
  }
  const sfx = timeline.sfx.find(item => item.id === id);
  if (sfx) return sfxItems.find(item => item.ref === sfx.file)?.title || "효과음";
  const voice = timeline.voice.find(item => item.id === id);
  if (voice) return voice.file.split("/").at(-1) ?? voice.file;
  return id.startsWith("source:") ? "원본 소리" : id.replace(/^stem-(voice|bg):/, "$1");
}

const row = (id: string, actions: StudioAction[], rowHeight = TRACK_ROW_HEIGHT, name?: string): StudioRow => ({ id, actions, rowHeight, ...(name ? { name } : {}) });
const action = (id: string, start: number, end: number, effectId: string, movable = true, extra: Partial<StudioAction> = {}): StudioAction => ({ id, start, end, effectId, flexible: movable, movable, ...extra });

function markGroupEdges(actions: StudioAction[]): StudioAction[] {
  return actions.map((item, index) => ({
    ...item,
    ...(item.groupId ? {
      groupBefore: actions[index - 1]?.groupId === item.groupId,
      groupAfter: actions[index + 1]?.groupId === item.groupId,
    } : {}),
  }));
}

export function timelineToStudioRows(timeline: Timeline): StudioRow[] {
  const starts = videoStartTimes(timeline);
  const videoActions = markGroupEdges(timeline.video.map((clip) => action(clip.id, starts[clip.id]!, starts[clip.id]! + clipDuration(clip), clip.kind, true, { groupId: clip.groupId, startTransition: clip.startTransition, endTransition: clip.endTransition })));
  const overlayRows = timeline.overlays.map((layer, index) => row(
    `video-${index + 2}`,
    markGroupEdges(layer.map((clip) => action(clip.id, clip.startSec, clip.startSec + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec), "overlay", true, { groupId: clip.groupId, startTransition: clip.startTransition, endTransition: clip.endTransition }))),
    TRACK_ROW_HEIGHT,
    `영상 ${index + 2}`,
  )).reverse();
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
    ...overlayRows,
    row("video", videoActions, TRACK_ROW_HEIGHT, "영상 1"),
    ...(sourceActions.length ? [row("source", sourceActions)] : []),
    ...(stemVoice.length ? [row("stem-voice", stemVoice)] : []),
    ...(stemBg.length ? [row("stem-bg", stemBg)] : []),
    row("voice", timeline.voice.map((clip) => action(clip.id, clip.startSec, clip.startSec + clip.inEndSec - clip.inStartSec, "voice"))),
    ...[...new Set([0, ...timeline.sfx.map(sfxLane)])].sort((a, b) => a - b).map((lane, index, lanes) => row(sfxRowId(lane, lanes), timeline.sfx.filter((clip) => sfxLane(clip) === lane).map((clip) => action(clip.id, clip.startSec, clip.startSec + clip.inEndSec - clip.inStartSec, "sfx")), TRACK_ROW_HEIGHT, lane === 0 ? "효과음" : `효과음 ${index + 1}`)),
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
