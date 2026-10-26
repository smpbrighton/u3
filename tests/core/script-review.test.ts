import { describe, expect, it } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { DEFAULT_SCRIPT_REVIEW_PROMPT, reviewScriptResult } from "../../src/core/script-review";

const scene = (caption: string, inputIndex = 1) => ({
  caption, inputIndex, startSec: 0, endSec: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null,
});

describe("script review", () => {
  it("기본 검수 지시문은 U3 자막 검수와 보호 필드를 설명한다", () => {
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("자막");
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT).toContain("inputIndex");
  });

  it("장면 수나 보호 필드가 달라지면 검수 결과 대신 초안을 쓴다", () => {
    const draft = CodexScript.parse({ scenes: [scene("초안 하나"), scene("초안 둘", 2)] });
    const changed = CodexScript.parse({ scenes: [scene("검수 하나", 2), scene("검수 둘", 2)] });
    expect(reviewScriptResult(draft, changed)).toMatchObject({ script: draft, warning: expect.stringContaining("초안") });
    expect(reviewScriptResult(draft, CodexScript.parse({ scenes: [scene("검수 하나")] }))).toMatchObject({ script: draft, warning: expect.stringContaining("초안") });
  });

  it("검수 실패 시 초안과 경고를 돌려준다", () => {
    const draft = CodexScript.parse({ scenes: [scene("초안")] });
    expect(reviewScriptResult(draft, null, "검수 실패")).toEqual({ script: draft, warning: "검수 실패" });
  });

  it("보호 필드가 같으면 검수 자막을 채택한다", () => {
    const draft = CodexScript.parse({ scenes: [scene("초안")] });
    const reviewed = CodexScript.parse({ scenes: [scene("다듬은 자막")] });
    expect(reviewScriptResult(draft, reviewed)).toEqual({ script: reviewed, warning: null });
  });
});
