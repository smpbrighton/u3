import type { Timeline } from "../../core/schema";
import { deleteAudioClip, deleteCaptionClip, deleteVideoSelection } from "../../core/timeline/ops";
import { captionLayersOf, withCaptionLayers } from "../../core/schema";
import { normalizeSfxLanes } from "../../core/timeline/sfx-lanes";

export function deleteStudioSelection(timeline: Timeline, track: string, id: string): { timeline: Timeline; blocked: boolean } {
  if (track === "captions") {
    const layers = captionLayersOf(timeline);
    const first = layers[0]!;
    return { timeline: withCaptionLayers(timeline, [{ ...first, main: deleteCaptionClip(first.main, id) }, ...layers.slice(1)]), blocked: false };
  }
  if (track === "voice") return { timeline: { ...timeline, voice: deleteAudioClip(timeline.voice, id) }, blocked: false };
  if (track === "sfx" || /^sfx-\d+$/.test(track)) return { timeline: { ...timeline, sfx: normalizeSfxLanes(deleteAudioClip(timeline.sfx, id)) }, blocked: false };
  if (track === "video" || /^video-\d+$/.test(track)) return deleteVideoSelection(timeline, [id]);
  return { timeline, blocked: false };
}
