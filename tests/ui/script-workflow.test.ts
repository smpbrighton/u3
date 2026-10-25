import { describe, expect, it } from "vitest";
import { scriptGenerationView } from "../../src/ui/screens/script-workflow";

describe("대본 생성 화면 상태", () => {
  it("작업 준비 중에도 진행 표시를 보인다", () => {
    expect(scriptGenerationView({ phase: "starting", message: null, cancellable: false })).toEqual({
      progress: "대본 작업을 준비하고 있어요.",
      showCancel: false,
      error: null,
    });
  });

  it("Codex 작업 중에는 진행 내용과 취소 동작을 보인다", () => {
    expect(scriptGenerationView({ phase: "running", message: "Codex 실행 중", cancellable: true })).toEqual({
      progress: "Codex 실행 중",
      showCancel: true,
      error: null,
    });
  });

  it("타임라인 생성 또는 저장 오류의 이유를 화면에 남긴다", () => {
    expect(scriptGenerationView({ phase: "failed", message: null, cancellable: false, error: "영상 구간이 원본 길이를 넘습니다" })).toEqual({
      progress: null,
      showCancel: false,
      error: "영상 구간이 원본 길이를 넘습니다",
    });
  });
});
