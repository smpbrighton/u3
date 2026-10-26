import type { Timeline } from "../../core/schema";
import { deleteAudioClip, deleteCaptionClip, deleteVideoSelection } from "../../core/timeline/ops";
import { captionLayersOf, withCaptionLayers } from "../../core/schema";
import { normalizeSfxLanes } from "../../core/timeline/sfx-lanes";

export function deleteStudioSelection(timeline: Timeline, track: string, id: string): { timeline: Timeline; blocked: boolean } {
  if (track === "captions" || /-main$|-sub$/.test(track)) {
    const layers = captionLayersOf(timeline);
    return { timeline: withCaptionLayers(timeline, layers.map(layer => ({ ...layer, main: layer.main.some(clip => clip.id === id) ? deleteCaptionClip(layer.main, id) : layer.main, sub: layer.sub.some(clip => clip.id === id) ? deleteCaptionClip(layer.sub, id) : layer.sub }))), blocked: false };
  }
  if (track === "voice") return { timeline: { ...timeline, voice: deleteAudioClip(timeline.voice, id) }, blocked: false };
  if (track === "sfx" || /^sfx-\d+$/.test(track)) return { timeline: { ...timeline, sfx: normalizeSfxLanes(deleteAudioClip(timeline.sfx, id)) }, blocked: false };
  if (track === "video" || /^video-\d+$/.test(track)) return deleteVideoSelection(timeline, [id]);
  return { timeline, blocked: false };
}
