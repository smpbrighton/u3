import { describe, expect, it } from "vitest";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

describe("buildScriptPrompt", () => {
  it("기본값은 현재 AI 추천 문장으로 시작한다", () => {
    expect(DEFAULT_SCRIPT_PROMPT.startsWith("영상과 사진을 보고 장면별 대본을 추천해 주세요.")).toBe(true);
  });

  it("AI 모드는 저장된 기본 지시문과 형식 규칙만 붙인다", () => {
    expect(buildScriptPrompt({ mode: "ai", basePrompt: "기본 지시문", formatRules: "형식 규칙", userPrompt: "무시할 요청" }))
      .toBe("기본 지시문\n\n형식 규칙");
  });

  it("직접 쓰기 모드는 사용자 요청을 형식 규칙 앞에 붙인다", () => {
    expect(buildScriptPrompt({ mode: "direct", basePrompt: "기본 지시문", userPrompt: "비 오는 날 카페 이야기", formatRules: "형식 규칙" }))
      .toBe("기본 지시문\n\n사용자 요청:\n비 오는 날 카페 이야기\n\n형식 규칙");
  });
});
