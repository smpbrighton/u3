import type { OverlayClip, Timeline } from "../schema";
import { clipDuration, overlayDuration } from "./ops";

export const RENDER_FPS = 30;

export interface RenderVideoSequence {
  id: string;
  kind: "main" | "meme";
  startFrame: number;
  durationInFrames: number;
  inputId?: string;
  memeId?: string;
  sourceStartFrame?: number;
}

export interface RenderCaption {
  id: string;
  startFrame: number;
  durationInFrames: number;
  text: string;
}

export interface RenderOverlay {
  id: string;
  layer: number;
  kind: "meme" | "video" | "photo";
  startFrame: number;
  durationInFrames: number;
  memeId?: string;
  inputId?: string;
  sourceStartFrame?: number;
  x: number;
  y: number;
  width: number;
}

export interface RenderAudioLayer {
  id: string;
  track: "source" | "voice" | "sfx" | "stem-voice" | "stem-bg" | "meme";
  startFrame: number;
  durationInFrames: number;
  sourceStartFrame: number;
  volume: number;
  file?: string;
  inputId?: string;
}

export interface RenderTimeline {
  fps: typeof RENDER_FPS;
  video: RenderVideoSequence[];
  overlay: RenderOverlay[];
  captions: RenderCaption[];
  audio: RenderAudioLayer[];
  durationInFrames: number;
}

const frame = (seconds: number) => Math.round(seconds * RENDER_FPS);
const volume = (gain: { gain: number; muted: boolean }, clipGain = 1) => gain.muted ? 0 : gain.gain * clipGain;

export function timelineToRender(timeline: Timeline): RenderTimeline {
  let cursorSec = 0;
  const video: RenderVideoSequence[] = [];
  const audio: RenderAudioLayer[] = [];
  const stems = timeline.audio.stems ?? {};

  for (const clip of timeline.video) {
    const durationSec = clipDuration(clip);
    const startFrame = frame(cursorSec);
    const endFrame = frame(cursorSec + durationSec);
    const durationInFrames = endFrame - startFrame;
    if ("durationSec" in clip && clip.kind === "meme") {
      video.push({ id: clip.id, kind: "meme", startFrame, durationInFrames, memeId: clip.memeId });
      audio.push({ id: `${clip.id}-audio`, track: "meme", startFrame, durationInFrames, sourceStartFrame: 0, volume: volume(timeline.audio.source), inputId: clip.memeId });
    } else if ("durationSec" in clip) {
      video.push({ id: clip.id, kind: "main", startFrame, durationInFrames, inputId: clip.inputId });
    } else {
      video.push({ id: clip.id, kind: "main", startFrame, durationInFrames, inputId: clip.inputId, sourceStartFrame: frame(clip.inStartSec) });
      const separated = stems[clip.inputId];
      if (separated) {
        for (const stem of ["voice", "bg"] as const) {
          const gain = separated[stem];
          audio.push({ id: `${clip.id}-${stem}`, track: stem === "voice" ? "stem-voice" : "stem-bg", startFrame, durationInFrames, sourceStartFrame: frame(clip.inStartSec), volume: volume(gain), inputId: clip.inputId });
        }
      } else {
        audio.push({ id: `${clip.id}-source`, track: "source", startFrame, durationInFrames, sourceStartFrame: frame(clip.inStartSec), volume: volume(timeline.audio.source), inputId: clip.inputId });
      }
    }
    cursorSec += durationSec;
  }

  const captions = timeline.captions.map((clip) => ({ id: clip.id, startFrame: frame(clip.startSec), durationInFrames: frame(clip.endSec) - frame(clip.startSec), text: clip.text }));
  const overlay = timeline.overlays.flatMap((layer, layerIndex) => layer.map((clip: OverlayClip): RenderOverlay => ({
    id: clip.id,
    layer: layerIndex,
    kind: "memeId" in clip ? "meme" : clip.kind,
    startFrame: frame(clip.startSec),
    durationInFrames: frame(overlayDuration(clip)),
    ...( "memeId" in clip ? { memeId: clip.memeId } : { inputId: clip.inputId, ...(clip.kind === "video" ? { sourceStartFrame: frame(clip.inStartSec) } : {}) }),
    x: clip.x, y: clip.y, width: clip.width,
  })));
  for (const clip of timeline.overlays.flat().filter((item): item is Extract<OverlayClip, { kind: "video" }> => "kind" in item && item.kind === "video")) {
    const startFrame = frame(clip.startSec);
    const durationInFrames = frame(clip.inEndSec) - frame(clip.inStartSec);
    const separated = stems[clip.inputId];
    if (separated) {
      for (const stem of ["voice", "bg"] as const) {
        const gain = separated[stem];
        audio.push({ id: `${clip.id}-${stem}`, track: stem === "voice" ? "stem-voice" : "stem-bg", startFrame, durationInFrames, sourceStartFrame: frame(clip.inStartSec), volume: volume(gain), inputId: clip.inputId });
      }
    } else {
      audio.push({ id: `${clip.id}-source`, track: "source", startFrame, durationInFrames, sourceStartFrame: frame(clip.inStartSec), volume: volume(timeline.audio.source), inputId: clip.inputId });
    }
  }
  for (const clip of [...timeline.voice, ...timeline.sfx]) {
    const track = timeline.voice.includes(clip) ? "voice" : "sfx";
    const gain = track === "voice" ? timeline.audio.voice : timeline.audio.sfx;
    audio.push({
      id: clip.id, track, startFrame: frame(clip.startSec), durationInFrames: frame(clip.inEndSec - clip.inStartSec),
      sourceStartFrame: frame(clip.inStartSec), volume: volume(gain, clip.gain), file: clip.file,
    });
  }
  const durationInFrames = Math.max(
    frame(cursorSec),
    ...captions.map((clip) => clip.startFrame + clip.durationInFrames),
    ...audio.map((layer) => layer.startFrame + layer.durationInFrames),
  );
  return { fps: RENDER_FPS, video, overlay, captions, audio, durationInFrames };
}
