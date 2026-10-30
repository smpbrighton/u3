import type { CodexScript } from "./schema";

export const EMOJI = /\p{Extended_Pictographic}/u;

/** caption만 검사한다. 위반은 생성을 막지 않고 재생성과 경고에 쓴다.
 * 전역 자막 지침에 맞춰 이모지 수와 금지 문장부호만 검사한다. */
export function checkScriptStyle(script: CodexScript): string[] {
  const warnings: string[] = [];
  const captions = script.scenes.map(scene => scene.caption).join("\n");
  const emojiCount = [...captions.matchAll(/\p{Extended_Pictographic}/gu)].length;
  if (emojiCount > 2) warnings.push(`이모지 수가 ${emojiCount}개입니다. 대본 전체에서 2개까지만 씁니다.`);

  for (const [index, scene] of script.scenes.entries()) {
    for (const match of scene.caption.matchAll(/\?!|!!/gu)) {
      warnings.push(`장면 ${index + 1}: 금지 문장부호 '${match[0]}'를 고칩니다.`);
    }
  }
  return warnings;
}
