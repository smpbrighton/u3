import { describe, expect, it } from "vitest";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA } from "../../src/core/script-prompt";

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
