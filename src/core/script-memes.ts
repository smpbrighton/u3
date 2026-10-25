import type { CodexScript, MemeMeta } from "./schema";

export interface ResolvedScriptMemes {
  script: CodexScript;
  memes: Record<number, MemeMeta>;
  alternateMemes: Record<number, MemeMeta>;
  missingCount: number;
}

/** Codex 짤 위치를 정규화하고 순위 결과를 장면에 연결한다. */
export function resolveScriptMemes(
  script: CodexScript,
  rankedMemes: readonly (readonly MemeMeta[] | MemeMeta | null | undefined)[],
): ResolvedScriptMemes {
  const memes: Record<number, MemeMeta> = {};
  const alternateMemes: Record<number, MemeMeta> = {};
  let missingCount = 0;

  const scenes = script.scenes.map((scene, index) => {
    if (scene.reaction === null) return { ...scene, memeBefore: false, memeAfter: false };

    const ranked = rankedMemes[index];
    const candidates = Array.isArray(ranked) ? ranked : ranked ? [ranked] : [];
    const meme = candidates[0];
    if (!meme) {
      missingCount += 1;
      return { ...scene, memeBefore: false, memeAfter: false };
    }

    let memeBefore = scene.memeBefore;
    let memeAfter = scene.memeAfter;
    if (!memeBefore && !memeAfter) memeAfter = true;
    if (memeBefore && memeAfter) {
      const second = candidates.find(candidate => candidate.id !== meme.id);
      if (!second) {
        memeBefore = false;
        memeAfter = true;
      } else {
        alternateMemes[index] = second;
      }
    }
    memes[index] = meme;
    return { ...scene, memeBefore, memeAfter };
  });

  return { script: { scenes }, memes, alternateMemes, missingCount };
}
