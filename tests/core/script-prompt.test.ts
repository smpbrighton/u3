import { describe, expect, it } from "vitest";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

describe("buildScriptPrompt", () => {
  it("uUu 대본 원칙을 U3 자막에 맞춘 기본 지침으로 제공한다", () => {
    expect(DEFAULT_SCRIPT_PROMPT).toContain("## 언어집");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("## AI 티 줄이기");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("epoko77-ai/im-not-ai(MIT)");
    expect(DEFAULT_SCRIPT_PROMPT).toContain("자막은 영상 장면에 표시되는 문장");
    expect(DEFAULT_SCRIPT_PROMPT).not.toMatch(/\{\{|visual|upload|emphasis|revealWord|TTS|나레이션|상품:/i);
  });

  it("기본 지침, 사용자 요청, 화자 설정, 형식 규칙 순서로 조립한다", () => {
    expect(buildScriptPrompt({
      mode: "direct", basePrompt: "기본 지침", userPrompt: "사용자 요청", formatRules: "형식 규칙",
      voice: { speaker: "화자 설정", tone: "말투 설정", persona: "성격 설정" },
    })).toBe("기본 지침\n\n사용자 요청:\n사용자 요청\n\n화자:\n화자 설정\n\n말투:\n말투 설정\n\n성격:\n성격 설정\n\n형식 규칙");
  });

  it("비어 있는 화자 설정은 생략하고 AI 모드에서는 사용자 요청을 넣지 않는다", () => {
    expect(buildScriptPrompt({
      mode: "ai", basePrompt: "기본 지침", userPrompt: "무시", formatRules: "형식 규칙",
      voice: { speaker: "  ", tone: "", persona: "성격 설정" },
    })).toBe("기본 지침\n\n성격:\n성격 설정\n\n형식 규칙");
  });
});
