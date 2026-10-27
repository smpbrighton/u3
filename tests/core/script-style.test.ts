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
  });

  it("이모지는 장면 전체에서 두 개까지 허용한다", () => {
    expect(checkScriptStyle(script("신기하네. 😊✨", "너도 봤어? 🔥"))).toContainEqual(expect.stringContaining("이모지 수"));
    expect(checkScriptStyle(script("신기하네. 😊", "너도 봤어? ✨"))).toEqual([]);
  });

  it.each(["이게 😊 신기하네.", "😊 신기하네.", "신기하네 😊."])("문장 끝 부호 앞 이모지를 잡는다: %s", caption => {
    expect(checkScriptStyle(script(caption))).toContainEqual(expect.stringContaining("이모지 위치"));
  });

  it("공백·줄바꿈 뒤 이모지와 피부색·결합 이모지를 문장 뒤에 붙인다", () => {
    for (const caption of ["신기하네.\n😊 너도 봤어?", "신기하네. 👍🏽", "신기하네. 👩‍💻", "신기하네. ❤️"]) {
      expect(checkScriptStyle(script(caption))).toEqual([]);
    }
  });

  it("더라와 라더라를 합쳐 한 번까지만 허용한다", () => {
    expect(checkScriptStyle(script("참 좋더라. 남들도 좋다더라.", "너도 써 봤어?"))).toContainEqual(expect.stringContaining("더라"));
    expect(checkScriptStyle(script("좋다더라. 직접 써 봤어."))).toEqual([]);
  });

  it("더라를 문장 중간에 쓴 것은 말끝으로 세지 않는다", () => {
    expect(checkScriptStyle(script("좋더라는 말에 골랐어. 정말 다르더라."))).toEqual([]);
  });

  it("같은 말끝 세 번을 장면을 넘어 센다", () => {
    expect(checkScriptStyle(script("처음엔 안 믿었어. 좀 다르거든.", "직접 해 봤어. 신기하네.", "다시 골랐어."))).toContainEqual(expect.stringContaining("말끝 '었어'"));
    expect(checkScriptStyle(script("처음엔 안 믿었어. 좀 다르거든. 직접 해 봤어."))).toEqual([]);
  });

  it("같은 말끝이 두 문장 연속이면 장면을 넘어 잡는다", () => {
    expect(checkScriptStyle(script("직접 해 봤어. 😊", "결국 다시 골랐어."))).toContainEqual(expect.stringContaining("연속"));
    expect(checkScriptStyle(script("직접 해 봤어.", "좀 다르거든."))).toEqual([]);
  });

  it("지로 끝나는 말끝은 하나로 센다", () => {
    expect(checkScriptStyle(script("직접 봤지. 정말 다르거지."))).toContainEqual(expect.stringContaining("말끝 '지'"));
    expect(checkScriptStyle(script("직접 봤지. 정말 다르네."))).toEqual([]);
  });

  it("마지막 문장을 뺀 물음표는 두 개까지 허용한다", () => {
    expect(checkScriptStyle(script("이게 뭐야? 정말 다르네? 어떻게 했어? 너도 알지? 😊"))).toContainEqual(expect.stringContaining("물음표"));
    expect(checkScriptStyle(script("이게 뭐야? 정말 다르네? 너도 알지? 😊"))).toEqual([]);
    expect(checkScriptStyle(script("이게 뭐야? 정말 다르네? 어떻게 했어? 마지막은 내가 고를게."))).toContainEqual(expect.stringContaining("물음표"));
  });

  it("느낌표는 대본 전체에서 한 번까지 허용한다", () => {
    expect(checkScriptStyle(script("이게 뭐야! 정말 다르네!"))).toContainEqual(expect.stringContaining("느낌표"));
    expect(checkScriptStyle(script("정말 다르네! 너도 봤어?"))).toEqual([]);
  });

  it.each(["?!", "!!", "...", "…"])("금지 문장부호 %s를 잡는다", punctuation => {
    expect(checkScriptStyle(script(`정말 다르네${punctuation}`))).toContainEqual(expect.stringContaining("금지 문장부호"));
  });

  it.each(["좋아요.", "좋습니다!", "드디어 했음.", "드디어 해결함.", "이게 답임?", "이제 됨. 😊"])("금지 말투를 잡는다: %s", caption => {
    expect(checkScriptStyle(script(caption))).toContainEqual(expect.stringContaining("금지 말투"));
  });

  it.each(["좋네", "좋네 😊", "좋네. 다음 말", "좋네.\n다음 말"])("끝 부호 누락을 잡는다: %s", caption => {
    expect(checkScriptStyle(script(caption))).toContainEqual(expect.stringContaining("끝 부호"));
  });

  it.each(["ㅋㅋ 신기하네.", "ㅎㅎ 신기하네.", "ㄹㅇ 신기하네.", "ㅇㅈ 신기하네.", "ᄏᄏ 신기하네."])("초성 말을 잡는다: %s", caption => {
    expect(checkScriptStyle(script(caption))).toContainEqual(expect.stringContaining("초성 말"));
  });

  it.each(["댓글", "구독", "링크", "프로필"])("마지막 장면의 %s를 잡는다", word => {
    expect(checkScriptStyle(script(`${word} 확인했어. 너는 어때?`))).toContainEqual(expect.stringContaining("마지막 장면"));
    expect(checkScriptStyle(script(`${word} 확인했어.`, "너는 어때?"))).toEqual([]);
  });
});
