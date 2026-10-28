import { captionLayersOf, type Timeline } from "../../core/schema";

export function extendStudioSelection(previous: readonly string[], id: string, shift: boolean, range: readonly string[]) {
  return shift ? [...new Set([...previous, ...(range.length ? range : [id])])] : [id];
}
export function previewArrowAllowed(tag: string | undefined, editable: boolean | undefined, role: string | null) {
  return !editable && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag ?? "") && !["listbox", "option", "slider", "combobox", "textbox"].includes(role ?? "");
}

export function studioTrackForClip(timeline: Timeline, id: string, fallback = ""): string {
  if (timeline.video.some(c => c.id === id)) return "video";
  const layer = timeline.overlays.findIndex(l => l.some(c => c.id === id));
  if (layer >= 0) return `video-${layer + 2}`;
  if (timeline.voice.some(c => c.id === id)) return "voice";
  if (timeline.sfx.some(c => c.id === id)) return "sfx";
  const captions = captionLayersOf(timeline).find(l => [...l.main, ...l.sub].some(c => c.id === id));
  if (captions) return `${captions.id}-${captions.main.some(c => c.id === id) ? "main" : "sub"}`;
  return fallback;
}
