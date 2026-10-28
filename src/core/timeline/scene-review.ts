import { plainCaptionText } from "../captions";
import { captionLayersOf, type AudioClip, type CodexScript, type MemeMeta, type OverlayClip, type SfxMeta, type TextClip, type Timeline } from "../schema";
import { SCENE_SFX_MAX_SEC } from "../sfx";
import { DEFAULT_CHARS_PER_SEC, DEFAULT_PHOTO_MIN_SEC, memeClipPlacement } from "./from-script";
import { videoDuration } from "./ops";
import { placeOverlayInLowestLayer, removeOverlayFromLayers, updateOverlayInLayers } from "./overlay-layers";

type MemeClip = Extract<OverlayClip, { memeId: string }>;
type Position = "before" | "after";
export interface SceneRow {
  index: number;
  sec: number | null;
  captions: TextClip[];
  memes: { clip: MemeClip; position: Position }[];
  sfx: AudioClip[];
}

export function sceneClips(timeline: Timeline, script: CodexScript): SceneRow[] {
  const captions = captionLayersOf(timeline).flatMap(layer => [...layer.main, ...layer.sub]);
  const memes = timeline.overlays.flat().filter((clip): clip is MemeClip => "memeId" in clip);
  return script.scenes.map((_, index) => {
    const texts = captions.filter(clip => clip.sceneIndex === index);
    const pictures = memes.filter(clip => clip.sceneIndex === index).map(clip => ({ clip, position: /meme-before(?:$|-)/.test(clip.id) ? "before" as const : "after" as const }));
    const sfx = timeline.sfx.filter(clip => clip.sceneIndex === index);
    const starts = texts.length ? texts.map(clip => clip.startSec) : [...pictures.map(({ clip }) => clip.startSec), ...sfx.map(clip => clip.startSec)];
    return { index, sec: starts.length ? Math.min(...starts) : null, captions: texts, memes: pictures, sfx };
  });
}

export function usedMemeIds(timeline: Timeline, exceptClipId?: string): Set<string> {
  return new Set([...timeline.video, ...timeline.overlays.flat()].flatMap(clip => clip.id !== exceptClipId && "memeId" in clip ? [clip.memeId] : []));
}

function sceneRange(timeline: Timeline, script: CodexScript, index: number) {
  const row = sceneClips(timeline, script)[index];
  if (!row) throw new RangeError("장면을 찾을 수 없습니다");
  if (row.sec === null) return null;
  const duration = row.captions.length ? Math.max(...row.captions.map(clip => clip.endSec)) - row.sec
    : Math.max(DEFAULT_PHOTO_MIN_SEC, [...plainCaptionText(script.scenes[index]!.caption)].length / DEFAULT_CHARS_PER_SEC);
  return { startSec: row.sec, durationSec: Math.min(duration, videoDuration(timeline) - row.sec) };
}

function requireSceneMeme(timeline: Timeline, sceneIndex: number, clipId: string): MemeClip {
  const clip = timeline.overlays.flat().find((item): item is MemeClip => item.id === clipId && item.sceneIndex === sceneIndex && "memeId" in item);
  if (!clip) throw new Error("장면의 짤을 찾을 수 없습니다");
  return clip;
}

export function replaceSceneMeme(timeline: Timeline, script: CodexScript, sceneIndex: number, clipId: string, meme: MemeMeta): Timeline {
  const clip = requireSceneMeme(timeline, sceneIndex, clipId);
  if (usedMemeIds(timeline, clipId).has(meme.id)) throw new Error("프로젝트에서 이미 쓰는 짤입니다");
  const range = sceneRange(timeline, script, sceneIndex);
  const placement = range && range.durationSec > 0
    ? memeClipPlacement({ sceneStart: range.startSec, sceneDuration: range.durationSec, memeDuration: meme.durationSec, position: /meme-before(?:$|-)/.test(clip.id) ? "before" : "after" })
    : { startSec: clip.startSec, durationSec: Math.min(meme.durationSec ?? 2, 2, clip.durationSec) };
  return { ...timeline, overlays: updateOverlayInLayers(timeline.overlays, clipId, () => ({ ...clip, memeId: meme.id, ...placement })) };
}

export function removeSceneMeme(timeline: Timeline, sceneIndex: number, clipId: string): Timeline {
  requireSceneMeme(timeline, sceneIndex, clipId);
  return { ...timeline, overlays: removeOverlayFromLayers(timeline.overlays, clipId) };
}

export function insertSceneMeme(timeline: Timeline, script: CodexScript, sceneIndex: number, meme: MemeMeta): Timeline {
  if (usedMemeIds(timeline).has(meme.id)) throw new Error("프로젝트에서 이미 쓰는 짤입니다");
  const range = sceneRange(timeline, script, sceneIndex);
  if (!range || range.durationSec <= 0) return timeline;
  const id = `scene-${sceneIndex}-meme-after`;
  if (timeline.overlays.flat().some(clip => clip.id === id)) throw new Error("장면에 뒤 짤이 이미 있습니다");
  const placement = memeClipPlacement({ sceneStart: range.startSec, sceneDuration: range.durationSec, memeDuration: meme.durationSec, position: "after" });
  return { ...timeline, overlays: placeOverlayInLowestLayer(timeline.overlays, { id, sceneIndex, memeId: meme.id, ...placement, x: 0.5, y: 0.5, width: 0.6 }) };
}

function requireSceneSfx(timeline: Timeline, sceneIndex: number, clipId: string): AudioClip {
  const clip = timeline.sfx.find(item => item.id === clipId && item.sceneIndex === sceneIndex);
  if (!clip) throw new Error("장면의 효과음을 찾을 수 없습니다");
  return clip;
}

export function replaceSceneSfx(timeline: Timeline, sceneIndex: number, clipId: string, sfx: SfxMeta, videoEnd: number): Timeline {
  const clip = requireSceneSfx(timeline, sceneIndex, clipId);
  const duration = Math.min(SCENE_SFX_MAX_SEC, sfx.durationSec, videoEnd - clip.startSec);
  if (duration <= 0) return timeline;
  return { ...timeline, sfx: timeline.sfx.map(item => item.id === clipId ? { ...item, file: sfx.file, inStartSec: 0, inEndSec: duration } : item) };
}

export function removeSceneSfx(timeline: Timeline, sceneIndex: number, clipId: string): Timeline {
  requireSceneSfx(timeline, sceneIndex, clipId);
  return { ...timeline, sfx: timeline.sfx.filter(clip => clip.id !== clipId) };
}

export function insertSceneSfx(timeline: Timeline, script: CodexScript, sceneIndex: number, sfx: SfxMeta, videoEnd = videoDuration(timeline)): Timeline {
  const row = sceneClips(timeline, script)[sceneIndex];
  if (!row) throw new RangeError("장면을 찾을 수 없습니다");
  if (row.sec === null) return timeline;
  if (row.sfx.length) throw new Error("장면에 효과음이 이미 있습니다");
  const duration = Math.min(SCENE_SFX_MAX_SEC, sfx.durationSec, videoEnd - row.sec);
  if (duration <= 0) return timeline;
  return { ...timeline, sfx: [...timeline.sfx, { id: `scene-${sceneIndex}-sfx`, sceneIndex, startSec: row.sec, file: sfx.file, inStartSec: 0, inEndSec: duration, gain: 1 }] };
}
