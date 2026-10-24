import { SCENE_SFX, type SceneSfx } from "./schema";

export const SCENE_SFX_MAX_SEC = 1.5;
export const SCENE_SFX_FADE_SEC = 0.3;
export const SCENE_SFX_USES: Record<SceneSfx, string> = {
  shock: "깜짝 놀람, 소름 돋는 반전", fail: "실패, 허탈함, 체념", laugh: "웃긴 상황, 어이없는 웃음", applause: "인정, 감탄, 해냈을 때",
  alarm: "경고, 급한 상황, 문제 발생", impact: "쾅 하고 꽂히는 순간, 분노, 당황", bruh: "황당함, 의심, 귀찮음", notify: "알림, 기대, 새 소식",
  pop: "가볍게 톡 튀는 순간, 귀여운 반응", reveal: "짠 하고 보여 주는 순간",
};
export const MEME_EMOTION_SFX: Readonly<Record<string, SceneSfx>> = { 놀람: "shock", 소름: "shock", 체념: "fail", 억울: "fail", 분노: "impact", 당황: "impact", 웃음: "laugh", 의심: "bruh", 귀찮음: "bruh", 인정: "applause", 감동: "applause", 뿌듯함: "applause", 기대: "notify", 부끄러움: "pop" };
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
