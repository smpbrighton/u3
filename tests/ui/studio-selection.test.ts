import { describe, expect, it } from "vitest";
import { extendStudioSelection, previewArrowAllowed } from "../../src/ui/studio/selection";

describe("스튜디오 공통 선택", () => {
  it("Shift 선택은 자막·소리에서도 선택을 유지하고 더한다", () => {
    expect(extendStudioSelection(["a"], "b", true, [])).toEqual(["a", "b"]);
    expect(extendStudioSelection(["a"], "b", true, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(extendStudioSelection(["a"], "b", false, [])).toEqual(["b"]);
  });
  it("입력·슬라이더·자막 목록에서는 미리보기 방향키 이동을 듣지 않는다", () => {
    expect(previewArrowAllowed("INPUT", false, null)).toBe(false);
    expect(previewArrowAllowed("TEXTAREA", false, null)).toBe(false);
    expect(previewArrowAllowed("DIV", true, null)).toBe(false);
    expect(previewArrowAllowed("DIV", false, "listbox")).toBe(false);
    expect(previewArrowAllowed("SPAN", false, "slider")).toBe(false);
    expect(previewArrowAllowed("DIV", false, null)).toBe(true);
  });
});
