import { SCENE_SFX, type SceneSfx } from "./schema";
import type { JevAnswer, JevQuestion, JevRequest } from "./jev-api";

export const SCENE_SFX_MAX_SEC = 1.5;
export const SCENE_SFX_FADE_SEC = 0.3;
export const SCENE_SFX_USES: Record<SceneSfx, string> = {
  shock: "깜짝 놀람, 소름 돋는 반전", fail: "실패, 허탈함, 체념", laugh: "웃긴 상황, 어이없는 웃음", applause: "인정, 감탄, 해냈을 때",
  alarm: "경고, 급한 상황, 문제 발생", impact: "쾅 하고 꽂히는 순간, 분노, 당황", bruh: "황당함, 의심, 귀찮음", notify: "알림, 기대, 새 소식",
  pop: "가볍게 톡 튀는 순간, 귀여운 반응", reveal: "짠 하고 보여 주는 순간",
};
export const MEME_EMOTION_SFX: Readonly<Record<string, SceneSfx>> = { 놀람: "shock", 소름: "shock", 체념: "fail", 억울: "fail", 분노: "impact", 당황: "impact", 웃음: "laugh", 의심: "bruh", 귀찮음: "bruh", 인정: "applause", 감동: "applause", 뿌듯함: "applause", 기대: "notify", 부끄러움: "pop" };
export const SFX_FIT_LIMIT = 90;
export const SFX_FIT_QUESTION = "이 상황에 아래 효과음을 넣으면 얼마나 잘 맞는가? 의미와 분위기를 함께 본다.";
export const SFX_FIT_LEVELS = ["상황과 맞지 않는다", "분위기는 비슷하지만 어긋난다", "상황에 대체로 맞는다", "상황에 딱 맞는다"];
export type SfxSituationCandidate = { id: string; title?: string; category?: string; description?: string };

export function sfxSituationFitRequest(situation: string, candidates: readonly SfxSituationCandidate[]) {
  const selected = candidates.slice(0, SFX_FIT_LIMIT);
  const questions: Record<string, JevQuestion> = {};
  for (const [index, candidate] of selected.entries()) {
    const category = candidate.category ?? "분류 없음";
    questions[`f${index}`] = {
      type: "score",
      instructions: { 질문: SFX_FIT_QUESTION, 효과음: `${candidate.title ?? candidate.id} (${category})${candidate.description ? `: ${candidate.description}` : ""}`, 용도: SCENE_SFX_USES[category as SceneSfx] ?? "" },
      criteria: SFX_FIT_LEVELS,
    };
  }
  return {
    request: { state: { 장면: { 상황: situation } }, questions } satisfies JevRequest,
    asked: selected.map(candidate => candidate.id),
    unasked: candidates.slice(SFX_FIT_LIMIT).map(candidate => candidate.id),
  };
}

export function readSfxFits(asked: readonly string[], unasked: readonly string[], answers: Record<string, JevAnswer>) {
  const scored = asked.map((id, index) => {
    const answer = answers[`f${index}`];
    if (!answer || answer.type !== "score") throw new Error(`Jev 답이 없습니다: 질문 f${index}`);
    return { id, fit: answer.score, confidence: answer.confidence, index };
  });
  scored.sort((a, b) => b.fit - a.fit || a.index - b.index);
  return [...scored.map(({ id, fit, confidence }) => ({ id, fit, confidence })), ...unasked.map(id => ({ id, fit: 0, confidence: 0 }))];
}

export function sfxSituationScore(situation: string, candidate: SfxSituationCandidate): number {
  const query = situation.toLocaleLowerCase();
  const category = candidate.category ?? "";
  const uses = SCENE_SFX_USES[category as SceneSfx] ?? "";
  let score = 0;
  if ([candidate.id, candidate.title, category, candidate.description].some(value => value?.toLocaleLowerCase().includes(query) || (query.length > 1 && value?.toLocaleLowerCase().includes(query.slice(0, -1))))) score += 100;
  if (uses && [...query.matchAll(/[가-힣]{2,}|[a-z]{2,}/gi)].some(([word]) => uses.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) score += 20;
  if (Object.entries(MEME_EMOTION_SFX).some(([emotion, sfx]) => sfx === category && query.includes(emotion))) score += 10;
  if (category === "reveal" && /(반전|드러|밝혀|공개)/.test(query)) score += 20;
  if (category === "shock" && /(반전|놀|깜짝|소름)/.test(query)) score += 20;
  return score;
}

export function orderSfxSituationCandidates<T extends SfxSituationCandidate>(situation: string, items: readonly T[]): { item: T; score: number }[] {
  return items.map((item, index) => ({ item, score: sfxSituationScore(situation, item), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item, score }) => ({ item, score }));
}
export const isSceneSfx = (value: string): value is SceneSfx => (SCENE_SFX as readonly string[]).includes(value);
export type SceneSfxSource = "script" | "meme" | null;
export function resolveSceneSfx(scene: { sfxCategory?: SceneSfx; reaction?: string }, memeEmotion?: string | null): { sfx: SceneSfx | null; source: SceneSfxSource } {
  if (scene.sfxCategory) return { sfx: scene.sfxCategory, source: "script" };
  const mapped = MEME_EMOTION_SFX[memeEmotion ?? scene.reaction ?? ""];
  return mapped ? { sfx: mapped, source: "meme" } : { sfx: null, source: null };
}
export const effectiveSceneSfx = (...args: Parameters<typeof resolveSceneSfx>): SceneSfx | null => resolveSceneSfx(...args).sfx;
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (const byte of new TextEncoder().encode(value)) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }
export function pickSfxFile<T>(list: readonly T[], projectId: string, sceneIndex: number): T | null { return list.length ? list[fnv1a(`${projectId}#${sceneIndex}`) % list.length]! : null; }
export function formatSfxCategories(categories: readonly string[]): string {
  const have = SCENE_SFX.filter((category) => categories.includes(category));
  return have.length ? have.map((category) => `- ${category}: ${SCENE_SFX_USES[category]}`).join("\n") : "(없음)";
}
