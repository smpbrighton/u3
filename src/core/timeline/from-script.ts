import type { AudioClip, CodexScript, Input, MemeMeta, SfxMeta, Timeline, VideoClip } from "../schema";
import { pickSfxFile, resolveSceneSfx, SCENE_SFX_MAX_SEC } from "../sfx";
import { placeOverlayInLowestLayer } from "./overlay-layers";

export const DEFAULT_CHARS_PER_SEC = 5.7;
export const DEFAULT_PHOTO_MIN_SEC = 1.5;
export const DEFAULT_MEME_MAX_SEC = 2;

export interface SfxLibraryItem {
  id: string;
  category: string;
  file: string;
  durationSec?: number;
}

export interface FromScriptOptions {
  /** scene index (0-based) -> selected meme */
  memes?: Readonly<Record<number, MemeMeta>>;
  /** scene index (0-based) -> second ranked meme for scenes with both placements */
  alternateMemes?: Readonly<Record<number, MemeMeta>>;
  projectId?: string;
  sfxLibrary?: Readonly<Record<string, readonly SfxLibraryItem[]>>;
  /** scene index (0-based) -> preselected sound effect */
  sfx?: Readonly<Record<number, SfxMeta>>;
}

function videoClip(sceneIndex: number, input: Input, startSec: number, endSec: number): VideoClip {
  if (input.kind === "photo") return { id: `scene-${sceneIndex}-main`, kind: "main", inputId: input.id, durationSec: endSec - startSec };
  const end = input.durationSec === undefined ? endSec : Math.min(endSec, input.durationSec);
  if (startSec < 0 || end <= startSec || (input.durationSec !== undefined && endSec > input.durationSec)) {
    throw new RangeError(`장면 ${sceneIndex + 1}의 영상 구간이 원본 길이를 넘습니다`);
  }
  return { id: `scene-${sceneIndex}-main`, kind: "main", inputId: input.id, inStartSec: startSec, inEndSec: end };
}

export function timelineFromScript(script: CodexScript, inputs: readonly Input[], options: FromScriptOptions = {}): Timeline {
  const video: VideoClip[] = [];
  let overlays: Timeline["overlays"] = [];
  const captions: Timeline["captions"] = [];
  const sfx: AudioClip[] = [];
  let cursor = 0;

  script.scenes.forEach((scene, index) => {
    const input = inputs[scene.inputIndex - 1];
    if (!input) throw new RangeError(`대본 장면 ${index + 1}의 입력 항목을 찾을 수 없습니다`);
    const startSec = scene.startSec ?? 0;
    let mainDuration = scene.startSec === null
      ? (input.kind === "photo" ? Math.max(DEFAULT_PHOTO_MIN_SEC, [...scene.caption].length / DEFAULT_CHARS_PER_SEC) : input.durationSec)
      : scene.endSec! - scene.startSec;
    if (mainDuration === undefined || mainDuration <= 0) throw new RangeError(`입력 ${input.id}의 길이가 없습니다`);
    if (input.kind === "photo" && scene.startSec === null) mainDuration = Math.max(DEFAULT_PHOTO_MIN_SEC, [...scene.caption].length / DEFAULT_CHARS_PER_SEC);
    const mainStart = input.kind === "video" && scene.startSec !== null ? startSec : 0;
    const mainEnd = mainStart + mainDuration;
    const meme = options.memes?.[index];
    const addMeme = (suffix: "before" | "after") => {
      const selected = suffix === "after" && scene.memeBefore && scene.memeAfter
        ? options.alternateMemes?.[index] ?? meme
        : meme;
      if (!selected) throw new Error(`장면 ${index + 1}의 짤을 찾을 수 없습니다`);
      const durationSec = Math.min(selected.durationSec ?? DEFAULT_MEME_MAX_SEC, DEFAULT_MEME_MAX_SEC, mainDuration);
      const start = suffix === "before" ? cursor : Math.max(cursor, cursor + mainDuration - durationSec);
      overlays = placeOverlayInLowestLayer(overlays, { id: `scene-${index}-meme-${suffix}`, memeId: selected.id, startSec: start, durationSec, x: 0.5, y: 0.5, width: 0.6 });
    };
    if (scene.memeBefore) addMeme("before");
    video.push(videoClip(index, input, mainStart, mainEnd));
    if (scene.memeAfter) addMeme("after");

    const durationSec = mainDuration;
    captions.push({ id: `scene-${index}-caption`, startSec: cursor, endSec: cursor + durationSec, text: scene.caption });
    const category = resolveSceneSfx(
      { sfxCategory: scene.sfxCategory ?? undefined, reaction: scene.reaction ?? undefined },
      options.memes?.[index]?.emotion,
    ).sfx;
    const candidates = category ? options.sfxLibrary?.[category] ?? [] : [];
    const effect = category
      ? pickSfxFile(candidates, options.projectId ?? "", index) ?? options.sfx?.[index] ?? null
      : null;
    if (effect) sfx.push({
      id: `scene-${index}-sfx`,
      startSec: cursor,
      file: effect.file,
      inStartSec: 0,
      inEndSec: Math.min(SCENE_SFX_MAX_SEC, effect.durationSec ?? SCENE_SFX_MAX_SEC),
      gain: 1,
    });
    cursor += durationSec;
  });

  return {
    video, overlays, captions, voice: [], sfx,
    audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
  };
}
