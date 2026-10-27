import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

describe("uUu script prompt transfer", () => {
  it("preserves the seven frame stories, their hooks, and the language-book choices", () => {
    for (const frame of ["trend", "mz", "relation", "mystery", "community", "twist", "identity"]) {
      expect(DEFAULT_SCRIPT_PROMPT).toContain(frame);
    }
    expect(DEFAULT_SCRIPT_PROMPT).toContain("남편 차에 몰래 뒀더니 ~한 썰");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("택배 기사님이 웃고 간 이유");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("반려동물 키우는 집사");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("숨기고 싶었던 고백");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("단톡방, 맘카페, 회사 탕비실");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("마지막 질문 모양");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("너라면 ~할래, 아니면 ~할래?");
  });

  it("keeps the conversational exaggeration, ending, punctuation, and humanizer rules", () => {
    expect(DEFAULT_SCRIPT_PROMPT).toContain("과장이 기본이다");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("같은 말끝은 대본 전체에서 두 번까지만");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("문장부호(자막을 읽는 사람의 억양)");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("epoko77-ai/im-not-ai(MIT)");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("문장 하나는 공백을 포함해 15~40자");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("장면 하나의 caption은 1~3문장");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("U3 형식 규칙과 충돌하면 U3 형식 규칙을 따른다");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("장면에서 보이는 동작과 대상은 그 장면의 입력 항목과 시각에 맞아야 한다");
  });

  it("더라 말끝을 한 번으로 제한하고 읽지 않는 이모지를 문장 뒤에 두 개까지 허용한다", () => {
    expect(DEFAULT_SCRIPT_PROMPT).toContain('"~더라"·"~라더라"는 합쳐서 대본 전체에서 1번까지만');
    expect(DEFAULT_SCRIPT_PROMPT).toContain("이모지는 대본 전체에서 2개까지");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("문장 끝 부호 뒤에만");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("이모지는 읽지 않는다");
    expect(DEFAULT_SCRIPT_PROMPT).toContain('"ㅋㅋ", "ㄹㅇ" 같은 초성 말은 쓰지 않는다');
    expect(DEFAULT_SCRIPT_PROMPT).not.toContain("초성 말과 이모지는 쓰지 않는다");
    expect(DEFAULT_SCRIPT_PROMPT).toMatch(/예시 3[\s\S]*\p{Extended_Pictographic}/u);
  });
});
