import type { JevAnswer, JevQuestion, JevRequest } from "./jev-api";
import { matchMemes, type MemeMatch, type MemeMatchInput, type MemeMatchOptions, type MemeVisual } from "./meme-match";
import type { MemeMeta } from "./schema";

export const MEME_RULE_TOP = 10;
export const MEME_RULE_ONLY_TOP = 40;
export const RECENT_FIT_PENALTY = 0.5;
export const MEME_RANK_CONCURRENCY = 4;
export const MEME_FIT_QUESTION = "이 장면에 아래 짤을 반응 짤로 넣으면 얼마나 맞는가? 감정 종류, 세기, 톤을 함께 본다.";
export const MEME_FIT_LEVELS = ["감정이 장면과 다르다", "감정 방향은 비슷하지만 세기나 톤이 어긋난다", "감정과 세기가 대체로 맞는다", "감정·세기·톤이 딱 맞는다"];
export type MemeRankScene = MemeVisual & { caption: string };
export function memeRankKey(scene: MemeRankScene): string { return JSON.stringify([scene.caption, scene.reaction ?? null, scene.query]); }
export function memeSceneState(scene: MemeRankScene): { 장면: Record<string, string> } {
  return { 장면: { 자막: scene.caption, ...(scene.reaction ? { 원하는_반응: scene.reaction } : {}), 짤_지시: scene.query } };
}
export function memeSituationState(situation: string): { 장면: Record<string, string> } { return { 장면: { 상황: situation } }; }
export function memeSearchText(visual: MemeVisual): string { return visual.reaction ? `${visual.reaction}: ${visual.query}` : visual.query; }
export function memeDoc(meme: Pick<MemeMeta, "emotion" | "situations"> & { description?: string }): string { return `${meme.emotion}: ${meme.description ?? ""} (${meme.situations.join(", ")})`; }
export interface MemeFitCandidate { id: string; description?: string }
export interface MemeFitRequest { request: JevRequest; asked: string[]; unasked: string[] }
export function memeFitRequest(state: JevRequest["state"], candidates: readonly MemeFitCandidate[]): MemeFitRequest {
  const asked: string[] = [];
  const unasked: string[] = [];
  const questions: Record<string, JevQuestion> = {};
  for (const candidate of candidates) {
    if (!candidate.description) { unasked.push(candidate.id); continue; }
    questions[`f${asked.length}`] = { type: "score", instructions: { 질문: MEME_FIT_QUESTION, 짤: candidate.description }, criteria: MEME_FIT_LEVELS };
    asked.push(candidate.id);
  }
  return { request: { state, questions }, asked, unasked };
}
export interface MemeFit { id: string; fit: number; confidence: number }
export function readMemeFits(asked: readonly string[], unasked: readonly string[], answers: Record<string, JevAnswer>): MemeFit[] {
  const scored = asked.map((id, n) => {
    const answer = answers[`f${n}`];
    if (!answer || answer.type !== "score") throw new Error(`Jev 답이 없습니다: 질문 f${n}`);
    return { id, fit: answer.score, confidence: answer.confidence, n };
  });
  scored.sort((a, b) => b.fit - a.fit || a.n - b.n);
  return [...scored.map(({ id, fit, confidence }) => ({ id, fit, confidence })), ...unasked.map((id) => ({ id, fit: 0, confidence: 0 }))];
}
export function topBySimilarity(q: ArrayLike<number>, matrix: Float32Array, dim: number, k: number): { index: number; sim: number }[] {
  if (dim <= 0) return [];
  const rows = Math.floor(matrix.length / dim);
  const sims = new Float32Array(rows);
  for (let row = 0; row < rows; row++) { let sum = 0; for (let d = 0; d < dim; d++) sum += q[d]! * matrix[row * dim + d]!; sims[row] = sum; }
  return [...sims.keys()].sort((a, b) => sims[b]! - sims[a]! || a - b).slice(0, Math.max(0, k)).map((index) => ({ index, sim: sims[index]! }));
}
export function mergeCandidates(embedded: readonly string[], rule: readonly string[]): string[] { return [...new Set([...embedded, ...rule])]; }
export interface OrderedMemes<T> { by: "jev" | "rule"; list: (MemeMatch<T> & { fit?: number })[] }
export function orderMemes<T extends MemeMatchInput>(visual: MemeVisual, library: readonly T[], opts: MemeMatchOptions = {}, limit = 3): OrderedMemes<T> {
  // Jev 호출 실패, 생략 또는 빈 응답이면 항상 검증된 규칙 점수 순위를 쓴다.
  return { by: "rule", list: matchMemes(visual, library, limit, opts) };
}
