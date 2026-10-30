import { describe, expect, it } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { checkScriptStyle } from "../../src/core/script-style";

function script(...captions: string[]) {
  return CodexScript.parse({
    title: "제목에는 댓글과 이모지 😊가 있어도 검사하지 않는다",
    scenes: captions.map(caption => ({ inputIndex: 1, startSec: 0, endSec: 2, caption, subCaption: "English 😊", reaction: null, sfxCategory: null })),
  });
}

describe("대본 말투 검사", () => {
  it("규칙을 지킨 대본과 문장 뒤 이모지를 통과시킨다", () => {
    expect(checkScriptStyle(script("처음엔 안 믿었거든. 😊 직접 보니까 다르더라!", "그래서 나도 골랐어. 너도 이런 적 있지? ✨"))).toEqual([]);
    expect(checkScriptStyle(script("시트 틈 부스러기까지 쏙", "발에 걸리던 선이 싹 정리됐어.", "좋아요", "드디어 해결함"))).toEqual([]);
  });

  it("이모지는 장면 전체에서 두 개까지 허용한다", () => {
    expect(checkScriptStyle(script("신기하네. 😊✨", "너도 봤어? 🔥"))).toContainEqual(expect.stringContaining("이모지 수"));
    expect(checkScriptStyle(script("신기하네. 😊", "너도 봤어? ✨"))).toEqual([]);
  });

  it("공백·줄바꿈 뒤 이모지와 피부색·결합 이모지를 문장 뒤에 붙인다", () => {
    for (const caption of ["신기하네.\n😊 너도 봤어?", "신기하네. 👍🏽", "신기하네. 👩‍💻", "신기하네. ❤️"]) {
      expect(checkScriptStyle(script(caption))).toEqual([]);
    }
  });

  it.each(["?!", "!!"])("금지 문장부호 %s를 잡는다", punctuation => {
    expect(checkScriptStyle(script(`정말 다르네${punctuation}`))).toContainEqual(expect.stringContaining("금지 문장부호"));
  });

  it.each(["...", "…", "ㅋㅋ", "ㅎㅎ", "ㄹㅇ", "ㅇㅈ", "ᄏᄏ"])("전역 자막 지침이 허용하는 말줄임표와 초성 %s에는 경고하지 않는다", expression => {
    expect(checkScriptStyle(script(`정말 다르네 ${expression}`))).toEqual([]);
  });
});
