import { describe, expect, it } from "vitest";
import { CODEX_MIN_VERSION, CODEX_MODEL_PREFERENCE, compareVersion, isCodexModelUnavailable, isCodexOutdated, nextCodexModel, resolveCodexModel } from "../../src/core/codex-model";

describe("Codex 모델 선택", () => {
  const catalog = ["gpt-6-astra", "gpt-6-luna", "gpt-6.1-sol", "gpt-6.1-terra"];
  it("계정 목록에 있는 저장 모델을 유지한다", () => {
    expect(resolveCodexModel("gpt-6-luna", catalog)).toBe("gpt-6-luna");
  });
  it("저장 모델이 없으면 선호 순서로 고른다", () => {
    expect(CODEX_MODEL_PREFERENCE).toEqual(["gpt-6.1-sol", "gpt-6-luna", "gpt-6.1-terra", "gpt-6-astra"]);
    expect(resolveCodexModel("gpt-5.5", catalog)).toBe("gpt-6.1-sol");
    expect(resolveCodexModel(undefined, ["gpt-6.1-terra", "gpt-6-luna"])).toBe("gpt-6-luna");
    expect(resolveCodexModel(undefined, ["account-model"])).toBe("account-model");
    expect(resolveCodexModel(undefined, [])).toBe("gpt-6.1-sol");
  });
  it("카탈로그를 읽지 못하면 저장 모델을 유지한다", () => {
    expect(resolveCodexModel("gpt-5.5", [])).toBe("gpt-5.5");
    expect(resolveCodexModel("gpt-6-luna", [])).toBe("gpt-6-luna");
  });
  it("실패한 모델은 다시 고르지 않고 목록 밖 모델도 고르지 않는다", () => {
    expect(nextCodexModel(["gpt-6-luna"], catalog)).toBe("gpt-6.1-sol");
    expect(nextCodexModel(["gpt-6-luna", "gpt-6.1-sol"], catalog)).toBe("gpt-6.1-terra");
    expect(nextCodexModel(catalog, catalog)).toBeNull();
    expect(nextCodexModel([], [])).toBeNull();
  });
  it.each([
    `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`,
    '{"code":"model_not_found"}',
    "Model metadata for 'gpt-6-luna' not found",
  ])("모델 불가 오류를 구분한다: %s", text => {
    expect(isCodexModelUnavailable(text)).toBe(true);
  });
  it.each(["usage limit reached", "authentication token expired", "unexpected argument --json", "network timeout"])("다른 오류는 모델 불가로 분류하지 않는다: %s", text => {
    expect(isCodexModelUnavailable(text)).toBe(false);
  });
});

describe("Codex 버전", () => {
  it("숫자로 비교하고 최소 버전부터 허용한다", () => {
    expect(CODEX_MIN_VERSION).toBe("0.159.3");
    expect(compareVersion("0.9.0", "0.159.3")).toBeLessThan(0);
    expect(compareVersion("1.0.0", "0.159.3")).toBeGreaterThan(0);
    expect(compareVersion("0.159.3", "0.159.3")).toBe(0);
    expect(isCodexOutdated("0.153.4")).toBe(true);
    expect(isCodexOutdated("0.159.3")).toBe(false);
    expect(isCodexOutdated("0.165.0")).toBe(false);
    expect(isCodexOutdated(null)).toBe(false);
  });
});
