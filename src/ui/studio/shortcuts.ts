import { DEFAULT_STUDIO_SHORTCUTS, lookupShortcut, normalizeChord, type Platform, type StudioAction, type StudioShortcutTable } from "../../core/studio-shortcuts";
import { uiPlatform } from "../platform";

export type StudioShortcut = StudioAction;

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

export function studioShortcut(event: StudioShortcutInput, bindings: StudioShortcutTable = DEFAULT_STUDIO_SHORTCUTS, platform: Platform = uiPlatform()): StudioShortcut | null {
  if (!event.code && (event.isComposing || event.keyCode === 229)) return null;
  const tagName = event.targetTagName?.toUpperCase() ?? "";
  const role = event.targetRole?.toLowerCase() ?? "";
  if (event.targetIsContentEditable || textTags.has(tagName) || event.targetType === "range" || textRoles.has(role)) return null;

  const space = event.code ? event.code === "Space" : event.key === " ";
  if (space && (tagName === "BUTTON" || spaceRoles.has(role))) return null;
  return lookupShortcut(bindings, normalizeChord(event, platform));
}
