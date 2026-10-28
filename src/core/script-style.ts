import type { CodexScript } from "./schema";

export const EMOJI = /\p{Extended_Pictographic}/u;

/** caption만 검사한다. 위반은 생성을 막지 않고 재생성과 경고에 쓴다.
 * 짧은 화면 자막 프롬프트(053)에 맞춰 읽기 규칙만 남긴다: 이모지 수, 금지 문장부호, 초성 말. */
export function checkScriptStyle(script: CodexScript): string[] {
  const warnings: string[] = [];
  const captions = script.scenes.map(scene => scene.caption).join("\n");
  const emojiCount = [...captions.matchAll(/\p{Extended_Pictographic}/gu)].length;
  if (emojiCount > 2) warnings.push(`이모지 수가 ${emojiCount}개입니다. 대본 전체에서 2개까지만 씁니다.`);

  for (const [index, scene] of script.scenes.entries()) {
    for (const match of scene.caption.matchAll(/\?!|!!|\.{3,}|…/gu)) {
      warnings.push(`장면 ${index + 1}: 금지 문장부호 '${match[0]}'를 고칩니다.`);
    }
    for (const match of scene.caption.matchAll(/[ㄱ-ㅎᄀ-ᄒ]+/gu)) {
      warnings.push(`장면 ${index + 1}: 초성 말 '${match[0]}'를 읽을 수 있는 말로 고칩니다.`);
    }
  }
  return warnings;
}
