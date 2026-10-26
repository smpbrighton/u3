import type { CodexScript, MemeMeta } from "./schema";

export interface ResolvedScriptMemes {
  script: CodexScript;
  memes: Record<number, MemeMeta>;
  alternateMemes: Record<number, MemeMeta>;
  missingCount: number;
}

export interface AutomaticMemeRank {
  by: "jev" | "rule";
  items: readonly (MemeMeta | { meme: MemeMeta; fit?: number })[];
}

function rankMeme(item: MemeMeta | { meme: MemeMeta; fit?: number }): { meme: MemeMeta; fit?: number } {
  return "meme" in item ? item : { meme: item };
}

/** 입력마다 하나의 짤을 보충하고, Jev 점수 동률은 앞 장면 순서를 유지한다. */
export function chooseMissingInputMemes(
  script: CodexScript,
  rankings: readonly AutomaticMemeRank[],
  existing: Readonly<Record<number, MemeMeta>> = {},
): ResolvedScriptMemes {
  const scenes = script.scenes.map(scene => ({ ...scene }));
  const memes = { ...existing };
  const missingInputs = new Set<number>();
  const assignedInputs = new Set<number>();
  for (const [index, scene] of scenes.entries()) {
    if (scene.memeBefore || scene.memeAfter || memes[index]) assignedInputs.add(scene.inputIndex);
  }
  for (const scene of scenes) if (!assignedInputs.has(scene.inputIndex)) missingInputs.add(scene.inputIndex);

  let missingCount = 0;
  for (const inputIndex of missingInputs) {
    const indexes = scenes.flatMap((scene, index) => scene.inputIndex === inputIndex ? [index] : []);
    const claimed = new Set(indexes.flatMap(index => memes[index] ? [memes[index]!.id] : []));
    const ranked = indexes.map(index => {
      const result = rankings[index] ?? { by: "rule" as const, items: [] };
      const candidates = result.items.map(rankMeme).filter(candidate => !claimed.has(candidate.meme.id));
      return { index, by: result.by, candidates };
    }).filter(item => item.candidates.length > 0);

    if (!ranked.length) {
      missingCount += indexes.length;
      continue;
    }

    const jev = ranked.filter(item => item.by === "jev" && item.candidates[0]?.fit !== undefined);
    const selected = jev.length
      ? [...jev].sort((a, b) => b.candidates[0]!.fit! - a.candidates[0]!.fit! || a.index - b.index)[0]!
      : ranked.at(-1)!;
    const candidate = selected.candidates[0]!.meme;
    const scene = scenes[selected.index]!;
    scenes[selected.index] = { ...scene, memeBefore: false, memeAfter: true };
    memes[selected.index] = candidate;
  }
  return { script: { scenes }, memes, alternateMemes: {}, missingCount };
}

/** Codex 짤 위치를 정규화하고 순위 결과를 장면에 연결한다. */
export function resolveScriptMemes(
  script: CodexScript,
  rankedMemes: readonly (readonly MemeMeta[] | MemeMeta | null | undefined)[],
): ResolvedScriptMemes {
  const memes: Record<number, MemeMeta> = {};
  const alternateMemes: Record<number, MemeMeta> = {};
  const usedByInput = new Map<number, Set<string>>();
  let missingCount = 0;

  const scenes = script.scenes.map((scene, index) => {
    if (scene.reaction === null) return { ...scene, memeBefore: false, memeAfter: false };

    const ranked = rankedMemes[index];
    const candidates = Array.isArray(ranked) ? ranked : ranked ? [ranked] : [];
    const used = usedByInput.get(scene.inputIndex) ?? new Set<string>();
    const meme = candidates.find(candidate => !used.has(candidate.id));
    if (!meme) {
      missingCount += 1;
      return { ...scene, memeBefore: false, memeAfter: false };
    }
    used.add(meme.id);
    usedByInput.set(scene.inputIndex, used);

    let memeBefore = scene.memeBefore;
    let memeAfter = scene.memeAfter;
    if (!memeBefore && !memeAfter) memeAfter = true;
    if (memeBefore && memeAfter) {
      const second = candidates.find(candidate => candidate.id !== meme.id);
      if (!second) {
        memeBefore = false;
        memeAfter = true;
      } else {
        const alternate = candidates.find(candidate => candidate.id !== meme.id && !used.has(candidate.id));
        if (alternate) {
          alternateMemes[index] = alternate;
          used.add(alternate.id);
        } else {
          memeBefore = false;
          memeAfter = true;
        }
      }
    }
    memes[index] = meme;
    return { ...scene, memeBefore, memeAfter };
  });

  return { script: { scenes }, memes, alternateMemes, missingCount };
}
