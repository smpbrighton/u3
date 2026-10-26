import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";
import { DEFAULT_SCRIPT_REVIEW_PROMPT } from "../../src/core/script-review";

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

  it("retains the read-through, story-flow, speech-style, and ending checks for captions", () => {
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("자막을 읽는 사람이 읽었을 때 어색한 곳만 고친다");
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("프레임의 흐름대로 이야기가 한 걸음씩 나아가는지");
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("같은 말끝은 대본 전체에서 두 번까지");
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("경험·의견을 묻는 공감 질문");
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("inputIndex, startSec, endSec, reaction, memeBefore, memeAfter, sfxCategory");
  });
});
