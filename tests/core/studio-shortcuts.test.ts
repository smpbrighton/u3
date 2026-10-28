import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_SHORTCUTS as defaults, STUDIO_ACTIONS, StudioShortcutTable, formatChord, lookupShortcut, normalizeChord, parseStudioShortcuts, shortcutConflict } from "../../src/core/studio-shortcuts";

describe("스튜디오 단축키 표", () => {
  it("여덟 동작의 기본 표를 검증하고 조회한다", () => {
    expect(STUDIO_ACTIONS).toHaveLength(8);
    expect(StudioShortcutTable.parse(defaults)).toEqual({ "split-pointer": "KeyC", "split-playhead": "KeyS", "toggle-play": "Space", group: "KeyM", ungroup: "Shift+KeyM", undo: "Mod+KeyZ", redo: "Mod+Shift+KeyZ", delete: "Backspace" });
    expect(lookupShortcut(defaults, "KeyC")).toBe("split-pointer");
    expect(lookupShortcut(defaults, "Mod+KeyM")).toBeNull();
  });

  it("물리 키·fallback·Delete를 정규화한다", () => {
    expect(normalizeChord({ key: "ㅊ", code: "KeyC" }, "mac")).toBe("KeyC");
    expect(normalizeChord({ key: "s", code: "" }, "mac")).toBe("KeyS");
    expect(normalizeChord({ key: " " }, "win")).toBe("Space");
    expect(normalizeChord({ key: "Delete", code: "Delete" }, "mac")).toBe("Backspace");
    expect(normalizeChord({ key: "Delete" }, "win")).toBe("Backspace");
    expect(normalizeChord({ key: "Shift", code: "ShiftLeft", shiftKey: true }, "mac")).toBeNull();
    expect(normalizeChord({ key: "ㅊ" }, "mac")).toBeNull();
    expect(normalizeChord({ key: "/", code: "Slash" }, "mac")).toBeNull();
  });

  it("플랫폼 명령키와 수정키 순서를 정확히 정한다", () => {
    expect(normalizeChord({ key: "z", code: "KeyZ", metaKey: true, altKey: true, shiftKey: true }, "mac")).toBe("Mod+Alt+Shift+KeyZ");
    expect(normalizeChord({ key: "z", ctrlKey: true }, "win")).toBe("Mod+KeyZ");
    expect(normalizeChord({ key: "z", ctrlKey: true }, "mac")).toBeNull();
    expect(normalizeChord({ key: "z", metaKey: true }, "win")).toBeNull();
    expect(normalizeChord({ key: "z", metaKey: true, ctrlKey: true }, "mac")).toBeNull();
  });

  it("부분 표와 잘못된 항목을 기본값으로 채우고 중복이면 전체를 복원한다", () => {
    expect(parseStudioShortcuts({ group: "KeyG" }, "mac")).toEqual({ ...defaults, group: "KeyG" });
    expect(parseStudioShortcuts({ group: "Slash", undo: "Mod+KeyC", redo: 123 }, "mac")).toEqual(defaults);
    expect(parseStudioShortcuts({ group: "KeyC" }, "mac")).toEqual(defaults);
    expect(parseStudioShortcuts({ group: "Mod+KeyQ" }, "win")).toEqual({ ...defaults, group: "Mod+KeyQ" });
    for (const invalid of [undefined, null, "broken", [], 123]) expect(parseStudioShortcuts(invalid, "mac")).toEqual(defaults);
  });

  it("허용하지 않는 code와 비정규 문자열을 거부한다", () => {
    for (const chord of ["Delete", "Slash", "Key한", "F13", "Ctrl+KeyZ", "Shift+Mod+KeyZ", "Mod+Mod+KeyZ", ""]) {
      expect(StudioShortcutTable.safeParse({ ...defaults, group: chord }).success).toBe(false);
    }
    for (const chord of ["Digit0", "F12", "ArrowLeft", "Home", "End", "PageUp", "PageDown", "Alt+Shift+KeyG"]) {
      expect(StudioShortcutTable.safeParse({ ...defaults, group: chord }).success).toBe(true);
    }
  });

  it("동작 충돌과 자기 자신의 조합을 구분한다", () => {
    expect(shortcutConflict(defaults, "group", "KeyS", "mac")).toEqual({ kind: "action", id: "split-playhead" });
    expect(shortcutConflict(defaults, "group", "KeyM", "mac")).toBeNull();
    expect(shortcutConflict(defaults, "group", "Mod+KeyM", "mac")).toBeNull();
  });

  it.each(["mac", "win"] as const)("%s 글 편집 조합과 공통 예약 키를 거부한다", platform => {
    for (const code of ["KeyA", "KeyC", "KeyV", "KeyX"]) for (const shift of ["", "Shift+"]) {
      expect(shortcutConflict(defaults, "group", `Mod+${shift}${code}`, platform)).toEqual({ kind: "text" });
    }
    expect(shortcutConflict(defaults, "group", "Mod+Backspace", platform)).toEqual({ kind: "text" });
    for (const chord of ["Tab", "Enter", "Escape", "Mod+KeyW", "Mod+Tab", "Mod+Space"]) expect(shortcutConflict(defaults, "group", chord, platform)).toEqual({ kind: "system" });
  });

  it("플랫폼별 시스템·앱 메뉴 조합을 거부한다", () => {
    for (const chord of ["Mod+KeyQ", "Mod+KeyH", "Mod+Alt+KeyH", "Mod+Shift+Digit3", "Mod+Shift+Digit4", "Mod+Shift+Digit5"]) expect(shortcutConflict(defaults, "group", chord, "mac")).toEqual({ kind: "system" });
    expect(shortcutConflict(defaults, "group", "Alt+F4", "win")).toEqual({ kind: "system" });
    expect(shortcutConflict(defaults, "group", "Alt+F4", "mac")).toBeNull();
    expect(shortcutConflict(defaults, "group", "Mod+KeyH", "win")).toBeNull();
  });

  it("두 플랫폼에서 현재 조합을 표시한다", () => {
    expect(formatChord("Mod+Alt+Shift+KeyZ", "mac")).toBe("⌘⌥⇧Z");
    expect(formatChord("Mod+Alt+Shift+KeyZ", "win")).toBe("Ctrl+Alt+Shift+Z");
    expect(formatChord("Backspace", "mac")).toBe("⌫");
    expect(formatChord("Space", "win")).toBe("Space");
    expect(formatChord("Digit3", "mac")).toBe("3");
    expect(formatChord("F12", "win")).toBe("F12");
  });
});
