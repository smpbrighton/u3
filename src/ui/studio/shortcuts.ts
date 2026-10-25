export type StudioShortcut = "split-pointer" | "split-playhead" | "group" | "ungroup" | "toggle-play" | "undo" | "redo" | "delete";

export interface StudioShortcutInput {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  targetTagName?: string;
  targetType?: string;
  targetRole?: string;
  targetIsContentEditable?: boolean;
}

const textTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const interactiveRoles = new Set(["slider", "switch", "checkbox", "radio", "combobox", "listbox", "option", "button", "tab"]);

export function studioShortcut(event: StudioShortcutInput): StudioShortcut | null {
  if (event.isComposing || (event.keyCode === 229 && !event.code)) return null;
  if (event.targetIsContentEditable || textTags.has(event.targetTagName?.toUpperCase() ?? "") || event.targetType === "range" || interactiveRoles.has(event.targetRole?.toLowerCase() ?? "")) return null;

  const key = event.code ? codeKey(event.code) : event.key.toLowerCase();
  const command = Boolean(event.metaKey || event.ctrlKey);

  if (command && !event.altKey && key === "z") return event.shiftKey ? "redo" : "undo";
  if (command && !event.altKey && key === "m") return event.shiftKey ? "ungroup" : "group";
  if (event.altKey) return null;
  if (key === "delete" || key === "backspace") return "delete";
  if (command) return null;
  if (key === "c") return event.shiftKey ? null : "split-pointer";
  if (key === "s") return event.shiftKey ? null : "split-playhead";
  if (key === " ") return event.shiftKey ? null : "toggle-play";
  if (key === "m") return event.shiftKey ? "ungroup" : "group";
  return null;
}

function codeKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code === "Space") return " ";
  return code.toLowerCase();
}
