// 짤 순위. uUu의 임베딩 후보 ∪ 규칙 후보 → Jev 적합도 흐름을 옮겼다.
// approval 기반 MemeRank 저장과 meme-import 참조는 U3 범위에서 제외했다.
import {
  MEME_RULE_ONLY_TOP,
  MEME_RULE_TOP,
  memeFitRequest,
  memeSceneState,
  memeSearchText,
  mergeCandidates,
  readMemeFits,
  type MemeFit,
  type MemeRankScene,
} from "../../core/meme-rank";
import { matchMemes, type MemeVisual } from "../../core/meme-match";
import type { JevRequest } from "../../core/jev-api";
import { JEV_MODEL, type JevClient } from "./jev";
import type { LibraryEntry } from "./library";
import type { MemeIndex } from "./meme-embed";
import { fileUsageLog, makeUsageEntry, type UsageLog } from "./usage";

const MEME_SEARCH_TOP = 40;

export interface MemeSearchResult {
  /** Jev 후보. 임베딩 결과를 먼저 두고 규칙 결과를 뒤에 둔다. */
  ids: string[];
  bge: { id: string; sim: number }[];
  rule: { id: string; score: number }[];
  elapsedMs: { embed: number; total: number };
  embedError?: string;
}

export async function searchMemeCandidates(
  deps: { index: MemeIndex | null },
  text: string,
  visual: MemeVisual,
  library: readonly LibraryEntry[],
  options: { k?: number; r?: number } = {},
): Promise<MemeSearchResult> {
  const start = performance.now();
  let bge: MemeSearchResult["bge"] = [];
  let embedError: string | undefined;
  if (deps.index) {
    try {
      bge = await deps.index.search(text, options.k ?? MEME_SEARCH_TOP);
    } catch (error) {
      embedError = error instanceof Error ? error.message : String(error);
    }
  }
  const embeddedAt = performance.now();
  const ruleLimit = deps.index && !embedError ? options.r ?? MEME_RULE_TOP : MEME_RULE_ONLY_TOP;
  const rule = ruleLimit > 0
    ? matchMemes(visual, library, ruleLimit).map(result => ({ id: result.meme.id, score: result.score }))
    : [];
  const ids = mergeCandidates(bge.map(item => item.id), rule.map(item => item.id));
  return {
    ids,
    bge,
    rule,
    elapsedMs: { embed: Math.round(embeddedAt - start), total: Math.round(performance.now() - start) },
    ...(embedError ? { embedError } : {}),
  };
}

export interface MemeJudgeResult {
  items: MemeFit[];
  model: string;
  elapsedMs: number;
  inputTokens: number;
}

export async function judgeMemes(
  deps: { jev: JevClient; usage: UsageLog },
  state: JevRequest["state"],
  byId: ReadonlyMap<string, Pick<LibraryEntry, "id" | "description">>,
  ids: readonly string[],
  projectId: string | null,
): Promise<MemeJudgeResult> {
  const { request, asked, unasked } = memeFitRequest(state, ids.flatMap(id => {
    const meme = byId.get(id);
    return meme ? [{ id, description: meme.description }] : [];
  }));
  if (!asked.length) return { items: readMemeFits(asked, unasked, {}), model: JEV_MODEL, elapsedMs: 0, inputTokens: 0 };
  const result = await deps.jev.ask(request);
  await deps.usage.append([makeUsageEntry({
    provider: "jev",
    unit: "input_tokens",
    amount: result.usage.inputTokens,
    projectId,
  })]);
  return { items: readMemeFits(asked, unasked, result.answers), model: result.model, elapsedMs: result.latencyMs, inputTokens: result.usage.inputTokens };
}

export interface RankSceneDeps {
  jev: JevClient | null;
  usage: UsageLog;
  index: MemeIndex | null;
  now?: () => Date;
}

export async function rankSceneMemes(
  deps: RankSceneDeps,
  scene: MemeRankScene,
  library: readonly LibraryEntry[],
  projectId: string | null,
) {
  const byId = new Map(library.map(meme => [meme.id, meme]));
  const found = await searchMemeCandidates(deps, memeSearchText(scene), scene, library);
  const fallback = () => ({
    by: "rule" as const,
    list: matchMemes(scene, library, MEME_RULE_ONLY_TOP).slice(0, MEME_RULE_TOP),
    search: found,
  });
  if (!deps.jev) return fallback();
  try {
    const judged = await judgeMemes({ jev: deps.jev, usage: deps.usage }, memeSceneState(scene), byId, found.ids, projectId);
    const byMeme = new Map(library.map(meme => [meme.id, meme]));
    return {
      by: "jev" as const,
      list: judged.items.flatMap(item => {
        const meme = byMeme.get(item.id);
        return meme ? [{ meme, score: item.fit, fit: item.fit, confidence: item.confidence }] : [];
      }).slice(0, MEME_RULE_TOP),
      search: found,
    };
  } catch {
    return fallback();
  }
}

export function createUsageLog(root: string): UsageLog {
  return fileUsageLog(root);
}
