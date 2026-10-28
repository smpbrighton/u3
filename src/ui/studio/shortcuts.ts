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
const textRoles = new Set(["slider", "combobox", "listbox", "option", "textbox", "searchbox", "spinbutton"]);
const spaceRoles = new Set(["button", "tab", "switch", "checkbox", "radio"]);

export function studioShortcut(event: StudioShortcutInput): StudioShortcut | null {
  if (!event.code && (event.isComposing || event.keyCode === 229)) return null;
  const tagName = event.targetTagName?.toUpperCase() ?? "";
  const role = event.targetRole?.toLowerCase() ?? "";
  if (event.targetIsContentEditable || textTags.has(tagName) || event.targetType === "range" || textRoles.has(role)) return null;

  const key = event.code ? codeKey(event.code) : event.key.toLowerCase();
  if (key === " " && (tagName === "BUTTON" || spaceRoles.has(role))) return null;
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
