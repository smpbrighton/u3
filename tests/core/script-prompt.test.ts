import { describe, expect, it } from "vitest";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

describe("buildScriptPrompt", () => {
  it("짧은 화면 자막 규칙을 기본 지침으로 제공한다", () => {
    expect(DEFAULT_SCRIPT_PROMPT).toMatch(/^영상 편집에 사용할 장면별 한국어 화면 자막을 작성한다\./);
    expect(DEFAULT_SCRIPT_PROMPT).toContain("공백 포함 25자 이내");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("14. 제공된 JSON 스키마와 입력 안내를 따른다");
    expect(DEFAULT_SCRIPT_PROMPT).not.toMatch(/7개 서사 프레임|언어집|AI 티 줄이기|예시 대본|\{\{|visual|upload|emphasis|revealWord|나레이션|상품:/);
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
