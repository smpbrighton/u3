import { describe, expect, it } from "vitest";
import { inputDisplayName } from "../../src/core/input";
import type { Input } from "../../src/core/schema";

describe("입력 표시 이름", () => {
  it("저장된 표시 이름을 쓰고 기존 프로젝트는 파일 이름으로 대체한다", () => {
    const added: Input = { id: "one", kind: "video", file: "input/7431257015cb.mov", displayName: "화면 기록.mov" };
    const legacy: Input = { id: "old", kind: "video", file: "input/7431257015cb.mov" };

    expect(inputDisplayName(added)).toBe("화면 기록.mov");
    expect(inputDisplayName(legacy)).toBe("7431257015cb.mov");
  });
});
