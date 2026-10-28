import { z } from "zod";

export const STUDIO_ACTIONS = [
  { id: "split-pointer", label: "포인터 자르기" },
  { id: "split-playhead", label: "재생 헤드 자르기" },
  { id: "toggle-play", label: "재생·일시 정지" },
  { id: "group", label: "묶기" },
  { id: "ungroup", label: "풀기" },
  { id: "undo", label: "실행 취소" },
  { id: "redo", label: "다시 실행" },
  { id: "delete", label: "삭제" },
] as const;
export type StudioAction = typeof STUDIO_ACTIONS[number]["id"];
export type Platform = "mac" | "win";

export const ALLOWED_CODES = new Set([
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  "Space", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
]);

function validChord(chord: string): boolean {
  const match = /^(Mod\+)?(Alt\+)?(Shift\+)?([^+]+)$/.exec(chord);
  return Boolean(match && ALLOWED_CODES.has(match[4]!));
}
const Chord = z.string().refine(validChord, "배정할 수 없는 키 조합입니다");
export const StudioShortcutTable = z.strictObject({
  "split-pointer": Chord, "split-playhead": Chord, "toggle-play": Chord,
  group: Chord, ungroup: Chord, undo: Chord, redo: Chord, delete: Chord,
});
export type StudioShortcutTable = z.infer<typeof StudioShortcutTable>;

export const DEFAULT_STUDIO_SHORTCUTS: StudioShortcutTable = {
  "split-pointer": "KeyC", "split-playhead": "KeyS", "toggle-play": "Space",
  group: "KeyM", ungroup: "Shift+KeyM", undo: "Mod+KeyZ", redo: "Mod+Shift+KeyZ", delete: "Backspace",
};

export interface ChordInput {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function normalizeChord(input: ChordInput, platform: Platform): string | null {
  if (platform === "mac" ? input.ctrlKey : input.metaKey) return null;
  let code = input.code;
  if (!code) {
    code = /^[a-z]$/i.test(input.key) ? `Key${input.key.toUpperCase()}`
      : /^[0-9]$/.test(input.key) ? `Digit${input.key}`
        : input.key === " " ? "Space" : input.key;
  }
  if (code === "Delete") code = "Backspace";
  if (!ALLOWED_CODES.has(code) && !["Tab", "Enter", "Escape"].includes(code)) return null;
  return [platform === "mac" ? input.metaKey && "Mod" : input.ctrlKey && "Mod", input.altKey && "Alt", input.shiftKey && "Shift", code].filter(Boolean).join("+");
}

const textChords = new Set([
  ...["KeyA", "KeyC", "KeyV", "KeyX"].flatMap(code => [`Mod+${code}`, `Mod+Shift+${code}`]),
  "Mod+Backspace",
]);
const commonSystemChords = ["Tab", "Enter", "Escape", "Mod+KeyW", "Mod+Tab", "Mod+Space"];
const macSystemChords = new Set([...commonSystemChords, "Mod+KeyQ", "Mod+KeyH", "Mod+Alt+KeyH", "Mod+Shift+Digit3", "Mod+Shift+Digit4", "Mod+Shift+Digit5"]);
const winSystemChords = new Set([...commonSystemChords, "Alt+F4"]);
export function RESERVED_CHORDS(platform: Platform) {
  // macOS ⌃⌘F는 normalizeChord가 모든 ⌃ 입력을 거부하므로 배정할 수 없다.
  return { text: textChords, system: platform === "mac" ? macSystemChords : winSystemChords };
}

export type ShortcutConflict = { kind: "action"; id: StudioAction } | { kind: "text" } | { kind: "system" };
export function shortcutConflict(table: StudioShortcutTable, id: StudioAction, chord: string, platform: Platform): ShortcutConflict | null {
  const reserved = RESERVED_CHORDS(platform);
  if (reserved.text.has(chord)) return { kind: "text" };
  if (reserved.system.has(chord)) return { kind: "system" };
  const action = STUDIO_ACTIONS.find(action => action.id !== id && table[action.id] === chord);
  return action ? { kind: "action", id: action.id } : null;
}

export function parseStudioShortcuts(value: unknown, platform: Platform): StudioShortcutTable {
  const table = { ...DEFAULT_STUDIO_SHORTCUTS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return table;
  const partial = value as Record<string, unknown>;
  for (const { id } of STUDIO_ACTIONS) {
    const chord = partial[id];
    if (typeof chord === "string" && validChord(chord) && !RESERVED_CHORDS(platform).text.has(chord) && !RESERVED_CHORDS(platform).system.has(chord)) table[id] = chord;
  }
  return new Set(Object.values(table)).size === STUDIO_ACTIONS.length ? table : { ...DEFAULT_STUDIO_SHORTCUTS };
}

export function lookupShortcut(table: StudioShortcutTable, chord: string | null): StudioAction | null {
  return STUDIO_ACTIONS.find(({ id }) => table[id] === chord)?.id ?? null;
}

export function formatChord(chord: string, platform: Platform): string {
  const symbols: Record<string, string> = platform === "mac" ? { Mod: "⌘", Alt: "⌥", Shift: "⇧" } : { Mod: "Ctrl", Alt: "Alt", Shift: "Shift" };
  return chord.split("+").map(part => symbols[part] ?? (part === "Backspace" ? "⌫" : part.replace(/^(Key|Digit)/, ""))).join(platform === "mac" ? "" : "+");
}
