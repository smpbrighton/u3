import { describe, expect, it } from "vitest";
import { audioGroupForRow, sfxRowId } from "../../src/core/timeline/sfx-lanes";

describe("효과음 lane 행 id", () => {
  it("표시 순번과 같은 행 id를 선택 트랙에 쓴다", () => {
    const lanes = [0, 1];
    expect(sfxRowId(0, lanes)).toBe("sfx");
    expect(sfxRowId(1, lanes)).toBe("sfx-2");
    expect(sfxRowId(1, lanes)).toBe(sfxRowId(1, lanes));
  });

  it("lane 사이 빈 번호를 압축한 행 id를 만든다", () => {
    expect(sfxRowId(2, [0, 2])).toBe("sfx-2");
  });

  it("추가 효과음 행을 모든 lane이 공유하는 효과음 음소거 그룹으로 바꾼다", () => {
    expect(audioGroupForRow("sfx")).toBe("sfx");
    expect(audioGroupForRow("sfx-2")).toBe("sfx");
    expect(audioGroupForRow("sfx-12")).toBe("sfx");
    expect(audioGroupForRow("voice")).toBe("voice");
    expect(audioGroupForRow("source")).toBe("source");
    expect(audioGroupForRow("video-2")).toBeNull();
  });
});
