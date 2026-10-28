import { describe, expect, it, vi } from "vitest";
import { studioShortcut } from "../../src/ui/studio/shortcuts";
import { DEFAULT_STUDIO_SHORTCUTS } from "../../src/core/studio-shortcuts";

vi.stubGlobal("navigator", { platform: "MacIntel" });

describe("스튜디오 단축키", () => {
  it("한글 입력 상태에서도 물리 키 코드로 단축키를 판정한다", () => {
    expect(studioShortcut({ key: "ㅊ", code: "KeyC" })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㄴ", code: "KeyS" })).toBe("split-playhead");
    expect(studioShortcut({ key: "ㅡ", code: "KeyM", metaKey: true })).toBeNull();
    expect(studioShortcut({ key: " ", code: "Space" })).toBe("toggle-play");
    expect(studioShortcut({ key: "ㅋ", code: "KeyZ", metaKey: true })).toBe("undo");
  });

  it("코드가 없을 때 key를 사용하고 조합 입력은 무시한다", () => {
    expect(studioShortcut({ key: "c", code: "" })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㅊ", code: "", isComposing: true })).toBeNull();
    expect(studioShortcut({ key: "Process", code: "", keyCode: 229 })).toBeNull();
  });

  it.each(["button", "tab", "switch", "checkbox", "radio"])("%s 포커스에서는 Space만 막고 편집 단축키를 허용한다", targetRole => {
    expect(studioShortcut({ key: "ㅊ", code: "KeyC", targetRole })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㄴ", code: "KeyS", targetRole })).toBe("split-playhead");
    expect(studioShortcut({ key: "Delete", code: "Delete", targetRole })).toBe("delete");
    expect(studioShortcut({ key: "Backspace", code: "Backspace", targetRole })).toBe("delete");
    expect(studioShortcut({ key: "m", code: "KeyM", metaKey: true, targetRole })).toBeNull();
    expect(studioShortcut({ key: "z", code: "KeyZ", ctrlKey: true, targetRole })).toBeNull();
    expect(studioShortcut({ key: " ", code: "Space", targetRole })).toBeNull();
    expect(studioShortcut({ key: " ", targetRole })).toBeNull();
  });

  it("role이 없는 기본 버튼에서도 Space만 막는다", () => {
    expect(studioShortcut({ key: "c", code: "KeyC", targetTagName: "BUTTON" })).toBe("split-pointer");
    expect(studioShortcut({ key: " ", code: "Space", targetTagName: "BUTTON" })).toBeNull();
  });

  it("글 입력 밖에서는 조합 중이어도 물리 키 코드로 판정한다", () => {
    expect(studioShortcut({ key: "ㅊ", code: "KeyC", isComposing: true })).toBe("split-pointer");
    expect(studioShortcut({ key: "ㄴ", code: "KeyS", isComposing: true, keyCode: 229, targetRole: "tab" })).toBe("split-playhead");
    expect(studioShortcut({ key: "Process", code: "KeyC", keyCode: 229 })).toBe("split-pointer");
    expect(studioShortcut({ key: "c", isComposing: true })).toBeNull();
    expect(studioShortcut({ key: "ㅊ", code: "KeyC", isComposing: true, targetTagName: "INPUT" })).toBeNull();
    expect(studioShortcut({ key: "ㅊ", code: "KeyC", isComposing: true, targetIsContentEditable: true })).toBeNull();
  });

  it.each(["slider", "combobox", "listbox", "option", "textbox", "searchbox", "spinbutton"])("%s 입력에서는 물리 키 코드가 있어도 단축키를 막는다", targetRole => {
    expect(studioShortcut({ key: "c", code: "KeyC", targetRole })).toBeNull();
    expect(studioShortcut({ key: "ㅊ", code: "KeyC", isComposing: true, targetRole })).toBeNull();
    expect(studioShortcut({ key: "Delete", code: "Delete", targetRole })).toBeNull();
    expect(studioShortcut({ key: "z", code: "KeyZ", metaKey: true, targetRole })).toBeNull();
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
    expect(studioShortcut({ key: "m", code: "KeyM", metaKey: true })).toBeNull();
    expect(studioShortcut({ key: "M", code: "KeyM", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(studioShortcut({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true })).toBe("redo");
    expect(studioShortcut({ key: "Delete", code: "Delete" })).toBe("delete");
    expect(studioShortcut({ key: "Backspace", code: "Backspace" })).toBe("delete");
    expect(studioShortcut({ key: "c", code: "KeyC", metaKey: true })).toBeNull();
  });

  it("사용자 표의 새 키만 실행하고 수정키를 정확히 비교한다", () => {
    const bindings = { ...DEFAULT_STUDIO_SHORTCUTS, "split-pointer": "KeyX", "toggle-play": "KeyP" };
    expect(studioShortcut({ key: "x", code: "KeyX" }, bindings)).toBe("split-pointer");
    expect(studioShortcut({ key: "c", code: "KeyC" }, bindings)).toBeNull();
    expect(studioShortcut({ key: "p", code: "KeyP" }, bindings)).toBe("toggle-play");
    expect(studioShortcut({ key: " ", code: "Space" }, bindings)).toBeNull();
    expect(studioShortcut({ key: "Backspace", code: "Backspace", metaKey: true }, bindings)).toBeNull();
    expect(studioShortcut({ key: "Backspace", code: "Backspace", shiftKey: true }, bindings)).toBeNull();
    expect(studioShortcut({ key: "x", code: "KeyX", shiftKey: true }, bindings)).toBeNull();
  });

  it.each(["button", "tab", "switch", "checkbox", "radio"])("재생 키를 바꿔도 %s에서 물리 Space를 보호한다", targetRole => {
    const bindings = { ...DEFAULT_STUDIO_SHORTCUTS, "split-pointer": "Space", "toggle-play": "KeyP" };
    expect(studioShortcut({ key: " ", code: "Space", targetRole }, bindings)).toBeNull();
    expect(studioShortcut({ key: " ", targetRole }, bindings)).toBeNull();
    expect(studioShortcut({ key: "p", code: "KeyP", targetRole }, bindings)).toBe("toggle-play");
    expect(studioShortcut({ key: " ", code: "Space" }, bindings)).toBe("split-pointer");
  });

  it("Windows 명령키는 Ctrl이고 macOS 명령키는 Meta다", () => {
    expect(studioShortcut({ key: "z", ctrlKey: true }, DEFAULT_STUDIO_SHORTCUTS, "win")).toBe("undo");
    expect(studioShortcut({ key: "z", metaKey: true }, DEFAULT_STUDIO_SHORTCUTS, "win")).toBeNull();
    expect(studioShortcut({ key: "z", ctrlKey: true, shiftKey: true }, DEFAULT_STUDIO_SHORTCUTS, "win")).toBe("redo");
  });
});
