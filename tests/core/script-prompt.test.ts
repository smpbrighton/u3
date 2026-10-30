import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA, DEFAULT_CAPTION_GUIDE } from "../../src/core/script-prompt";

describe("buildScriptPrompt", () => {
  it("친구에게 보내는 속말 자막 규칙을 기본 지침으로 제공한다", () => {
    expect(DEFAULT_SCRIPT_PROMPT).toMatch(/^내가 찍은 일상 릴스에 내가 친구에게 바로 보내는 짧고 자연스러운 한국어 SNS 속말 자막을 쓴다\./);
    expect(DEFAULT_SCRIPT_PROMPT).toContain("1. 사용자가 준 상황을 우선한다.");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("9. title은 필요할 때 한국어 30자 이내로 쓴다.");
    expect(DEFAULT_SCRIPT_PROMPT).not.toMatch(/25자 이내|14\. |7개 서사 프레임|언어집|AI 티 줄이기|예시 대본|\{\{|visual|upload|emphasis|revealWord|나레이션|상품:/);
  });

  it("말투와 성격의 기본 본문을 제공한다", () => {
    expect(DEFAULT_SCRIPT_TONE).toMatch(/^친구에게 바로 보내는 짧고 빠른 속말\./);
    expect(DEFAULT_SCRIPT_PERSONA).toMatch(/^친구 단톡에 현장중계를 하는 반응 빠른 구경꾼\./);
  });

  it("제목과 다음 빈 줄만 뺀 전역 자막 지침 원문을 마지막 줄바꿈까지 보존한다", () => {
    expect(createHash("sha256").update(DEFAULT_CAPTION_GUIDE).digest("hex")).toBe("f20c7f92096f98a23d5aae7ceef7fcf1510a3ee6a3c1a5a5fb16cf49da4b4b88");
    expect(DEFAULT_CAPTION_GUIDE).not.toContain("# 전역 자막 지침");
    expect(DEFAULT_CAPTION_GUIDE).toContain("참고: https://partnerhelp.netflixstudios.com/hc/en-us/articles/216001127-Korean-Timed-Text-Style-Guide\n");
  });

  it.each(["ai", "direct"] as const)("%s 모드에서 전역 자막 지침을 말투·성격 뒤, 형식 규칙 앞에 넣는다", mode => {
    expect(buildScriptPrompt({
      mode, basePrompt: "고친 대본", userPrompt: "사용자 요청", formatRules: "형식 규칙",
      voice: { tone: "고친 말투", persona: "고친 성격" }, captionGuide: "  공통 자막 규칙\n참고 URL  ",
    })).toBe(`고친 대본${mode === "direct" ? "\n\n사용자 요청:\n사용자 요청" : ""}\n\n말투:\n고친 말투\n\n성격:\n고친 성격\n\n전역 자막 지침:\n공통 자막 규칙\n참고 URL\n\n형식 규칙`);
  });

  it("말투·성격이 없어도 전역 자막 지침을 넣는다", () => {
    expect(buildScriptPrompt({ mode: "ai", basePrompt: "기본 지침", formatRules: "형식 규칙", captionGuide: "공통 자막 규칙" }))
      .toBe("기본 지침\n\n전역 자막 지침:\n공통 자막 규칙\n\n형식 규칙");
  });

  it.each([undefined, "", " \n "])("비어 있는 전역 자막 지침은 생략한다: %j", captionGuide => {
    expect(buildScriptPrompt({ mode: "ai", basePrompt: "기본 지침", formatRules: "형식 규칙", captionGuide }))
      .toBe("기본 지침\n\n형식 규칙");
  });

  it("기본 지침, 사용자 요청, 말투·성격 설정, 형식 규칙 순서로 조립한다", () => {
    expect(buildScriptPrompt({
      mode: "direct", basePrompt: "기본 지침", userPrompt: "사용자 요청", formatRules: "형식 규칙",
      voice: { tone: "말투 설정", persona: "성격 설정" },
    })).toBe("기본 지침\n\n사용자 요청:\n사용자 요청\n\n말투:\n말투 설정\n\n성격:\n성격 설정\n\n형식 규칙");
  });

  it("비어 있는 말투·성격 설정은 생략하고 AI 모드에서는 사용자 요청을 넣지 않는다", () => {
    expect(buildScriptPrompt({
      mode: "ai", basePrompt: "기본 지침", userPrompt: "무시", formatRules: "형식 규칙",
      voice: { tone: "", persona: "성격 설정" },
    })).toBe("기본 지침\n\n성격:\n성격 설정\n\n형식 규칙");
  });
});
