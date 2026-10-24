import type { MemeMeta } from "./schema";

export type MemeMatchInput = Pick<MemeMeta, "id" | "emotion" | "situations" | "tagsConfirmed" | "importedAt"> & Partial<Pick<MemeMeta, "description">>;
export interface MemeVisual { query: string; reaction?: string }
export const DESCRIPTION_SCORE_MAX = 6;
const norm = (value: string) => value.normalize("NFC").toLowerCase().trim();
function tokens(text: string): string[] { return norm(text).split(/[\s,./·|!?~()[\]"'“”‘’]+/).map((item) => item.trim()).filter((item) => [...item].length >= 2); }
function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of norm(text).split(/[\s,./·|!?~()[\]"'“”‘’…:;]+/)) {
    const chars = [...word];
    if (chars.length === 1) out.add(chars[0]!);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i]! + chars[i + 1]!);
  }
  out.delete("");
  return out;
}
export function descriptionScore(text: string, description: string): number {
  const source = bigrams(text);
  if (!source.size) return 0;
  const target = bigrams(description);
  let hit = 0;
  for (const gram of source) if (target.has(gram)) hit++;
  return Math.round((DESCRIPTION_SCORE_MAX * hit * 10) / source.size) / 10;
}
export function scoreMeme(visual: MemeVisual, meme: Pick<MemeMatchInput, "emotion" | "situations" | "tagsConfirmed" | "description">): number {
  const reaction = visual.reaction ? norm(visual.reaction) : "";
  const text = norm(`${visual.reaction ?? ""} ${visual.query}`);
  const words = tokens(text);
  const emotion = norm(meme.emotion);
  let score = 0;
  if (reaction && reaction === emotion) score += 10;
  else if (emotion && text.includes(emotion)) score += 5;
  for (const tag of meme.situations.map(norm).filter(Boolean)) {
    if (reaction && reaction === tag) score += 8;
    else if (text.includes(tag)) score += 4;
    else if (words.some((word) => tag.includes(word))) score += 2;
  }
  if (score > 0 && meme.tagsConfirmed) score += 0.5;
  if (meme.description) score += descriptionScore(text, meme.description);
  return score;
}
export interface MemeMatch<T> { meme: T; score: number }
export interface MemeMatchOptions { exclude?: Iterable<string>; recent?: Iterable<string> }
export function matchMemes<T extends MemeMatchInput>(visual: MemeVisual, memes: readonly T[], limit = 3, opts: MemeMatchOptions = {}): MemeMatch<T>[] {
  const exclude = new Set(opts.exclude ?? []);
  const recent = new Set(opts.recent ?? []);
  return memes.filter((item) => !exclude.has(item.id)).map((meme) => ({ meme, score: scoreMeme(visual, meme) - (recent.has(meme.id) ? 6 : 0) }))
    .sort((a, b) => b.score - a.score || b.meme.importedAt.localeCompare(a.meme.importedAt) || a.meme.id.localeCompare(b.meme.id)).slice(0, Math.max(0, limit));
}
