import type { CodexScript } from "./schema";

const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_SUFFIX = /[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u;
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

function sentencesOf(caption: string): string[] {
  const sentences: string[] = [];
  let current = "";
  let ended = false;
  for (const { segment } of segmenter.segment(caption)) {
    const punctuation = /^[.!?]+$/u.test(segment);
    if (ended && !punctuation && !/^\s+$/u.test(segment) && !EMOJI.test(segment)) {
      sentences.push(current.trim());
      current = "";
      ended = false;
    }
    current += segment;
    if (punctuation) ended = true;
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

/** caption만 검사한다. 위반은 생성을 막지 않고 재생성과 경고에 쓴다. */
export function checkScriptStyle(script: CodexScript): string[] {
  const warnings: string[] = [];
  const sentences = script.scenes.flatMap((scene, sceneIndex) => sentencesOf(scene.caption).map(text => {
    const withoutEmoji = text.replace(EMOJI_SUFFIX, "").trimEnd();
    const punctuation = withoutEmoji.match(/[.!?]+$/u)?.[0] ?? "";
    return { body: withoutEmoji.replace(/[.!?]+$/u, "").trimEnd(), punctuation, sceneIndex };
  }));
  const captions = script.scenes.map(scene => scene.caption).join("\n");
  const emojiCount = [...captions.matchAll(/\p{Extended_Pictographic}/gu)].length;
  if (emojiCount > 2) warnings.push(`이모지 수가 ${emojiCount}개입니다. 대본 전체에서 2개까지만 씁니다.`);

  for (const [index, scene] of script.scenes.entries()) {
    for (const match of scene.caption.matchAll(/\p{Extended_Pictographic}/gu)) {
      const prefix = scene.caption.slice(0, match.index).replace(EMOJI_SUFFIX, "");
      if (!/[.!?]$/u.test(prefix)) warnings.push(`장면 ${index + 1}: 이모지 위치를 문장 끝 부호 뒤로 옮깁니다.`);
    }
    for (const match of scene.caption.matchAll(/\?!|!!|\.{3,}|…/gu)) {
      warnings.push(`장면 ${index + 1}: 금지 문장부호 '${match[0]}'를 고칩니다.`);
    }
    for (const match of scene.caption.matchAll(/[ㄱ-ㅎᄀ-ᄒ]+/gu)) {
      warnings.push(`장면 ${index + 1}: 초성 말 '${match[0]}'를 읽을 수 있는 말로 고칩니다.`);
    }
  }

  const deoraCount = sentences.filter(sentence => /더라$/u.test(sentence.body)).length;
  if (deoraCount > 1) warnings.push(`'더라'·'라더라' 말끝이 ${deoraCount}번입니다. 합쳐서 1번까지만 씁니다.`);

  const endings = sentences.map(sentence => {
    const syllables = sentence.body.replace(/\s+/gu, "").match(/[가-힣]+$/u)?.[0] ?? "";
    return syllables.endsWith("지") ? "지" : syllables.slice(-2);
  });
  const counts = new Map<string, number>();
  for (const [index, ending] of endings.entries()) {
    if (!ending) continue;
    const count = (counts.get(ending) ?? 0) + 1;
    counts.set(ending, count);
    if (count === 3) warnings.push(`말끝 '${ending}'가 3번 이상입니다. 대본 전체에서 두 번까지만 씁니다.`);
    if (ending === endings[index - 1]) warnings.push(`문장 ${index + 1}: 말끝 '${ending}'가 두 문장 연속입니다.`);
  }

  const questions = sentences.slice(0, -1).reduce((count, sentence) => count + [...sentence.punctuation].filter(char => char === "?").length, 0);
  const exclamations = [...captions.matchAll(/!/gu)].length;
  if (questions > 2) warnings.push(`마지막 문장을 뺀 물음표가 ${questions}개입니다. 2개까지만 씁니다.`);
  if (exclamations > 1) warnings.push(`느낌표가 ${exclamations}개입니다. 1개까지만 씁니다.`);

  for (const [index, sentence] of sentences.entries()) {
    if (/(?:요|니다|음|함|임|됨)$/u.test(sentence.body)) warnings.push(`문장 ${index + 1}: 금지 말투 '${sentence.body}'를 반말로 고칩니다.`);
    if (!sentence.punctuation) warnings.push(`장면 ${sentence.sceneIndex + 1}: 문장 끝 부호가 없습니다. '.', '?', '!' 중 하나로 끝냅니다.`);
  }
  for (const word of ["댓글", "구독", "링크", "프로필"]) {
    if (script.scenes.at(-1)?.caption.includes(word)) warnings.push(`마지막 장면에서 '${word}' 안내를 뺍니다.`);
  }
  return warnings;
}
