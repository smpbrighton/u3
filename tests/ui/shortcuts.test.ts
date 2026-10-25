import { describe, expect, it } from "vitest";
import { studioShortcut } from "../../src/ui/studio/shortcuts";

describe("스튜디오 단축키", () => {
  it("한글 입력 상태에서도 물리 키 코드로 단축키를 판정한다", () => {
    expect(studioShortcut({ key: "ㅊ", code: "KeyC" })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㄴ", code: "KeyS" })).toBe("split-playhead");
    expect(studioShortcut({ key: "ㅡ", code: "KeyM", metaKey: true })).toBe("group");
    expect(studioShortcut({ key: " ", code: "Space" })).toBe("toggle-play");
    expect(studioShortcut({ key: "ㅋ", code: "KeyZ", metaKey: true })).toBe("undo");
  });

  it("코드가 없을 때 key를 사용하고 조합 입력은 무시한다", () => {
    expect(studioShortcut({ key: "c", code: "" })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㅊ", code: "", isComposing: true })).toBeNull();
    expect(studioShortcut({ key: "Process", code: "", keyCode: 229 })).toBeNull();
  });

  it("수정 키, 입력 요소와 select 안에서 금지된 단축키를 막는다", () => {
    expect(studioShortcut({ key: "c", code: "KeyC", ctrlKey: true })).toBeNull();
    expect(studioShortcut({ key: "s", code: "KeyS", altKey: true })).toBeNull();
    expect(studioShortcut({ key: " ", code: "Space", targetTagName: "INPUT" })).toBeNull();
    expect(studioShortcut({ key: "z", code: "KeyZ", metaKey: true, targetTagName: "TEXTAREA" })).toBeNull();
    expect(studioShortcut({ key: "m", code: "KeyM", targetTagName: "SELECT" })).toBeNull();
    expect(studioShortcut({ key: " ", code: "Space", targetType: "range" })).toBeNull();
    expect(studioShortcut({ key: "c", code: "KeyC", targetRole: "slider" })).toBeNull();
    expect(studioShortcut({ key: " ", code: "Space", targetRole: "switch" })).toBeNull();
  });

  it("묶기, 해제, 실행 취소, 다시 실행, 삭제 키를 구분한다", () => {
    expect(studioShortcut({ key: "m", code: "KeyM" })).toBe("group");
    expect(studioShortcut({ key: "M", code: "KeyM", shiftKey: true })).toBe("ungroup");
    expect(studioShortcut({ key: "m", code: "KeyM", metaKey: true })).toBe("group");
    expect(studioShortcut({ key: "M", code: "KeyM", ctrlKey: true, shiftKey: true })).toBe("ungroup");
    expect(studioShortcut({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true })).toBe("redo");
    expect(studioShortcut({ key: "Delete", code: "Delete" })).toBe("delete");
    expect(studioShortcut({ key: "Backspace", code: "Backspace" })).toBe("delete");
    expect(studioShortcut({ key: "c", code: "KeyC", metaKey: true })).toBeNull();
  });
});
