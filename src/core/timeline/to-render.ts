import type { CaptionStyle, ClipTransition, ClipTransitionInput, OverlayClip, Timeline, TransitionKind } from "../schema";
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
  opacity?: number;
  startTransition?: ClipTransition;
  endTransition?: ClipTransition;
}

export interface RenderTransition {
  id: string;
  fromId: string | null;
  toId: string | null;
  startFrame: number;
  durationInFrames: number;
  kind: TransitionKind;
  fromSourceStartFrame?: number;
  toSourceStartFrame?: number;
  playbackRate: number;
}

export interface RenderVolumeTransition {
  startFrame: number;
  durationInFrames: number;
  from: number;
  to: number;
}

export interface RenderCaption {
  id: string;
  layerId: string;
  layer: number;
  row: "main" | "sub";
  startFrame: number;
  durationInFrames: number;
  text: string;
  x: number;
  y: number;
  opacity?: number;
  layerOpacity: number;
  clipOpacity: number;
  textOpacity: number;
  barOpacity: number;
  style: CaptionStyle;
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
  opacity?: number;
  startTransition?: ClipTransition;
  endTransition?: ClipTransition;
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
  volumeTransitions?: RenderVolumeTransition[];
}

export interface RenderTimeline {
  fps: typeof RENDER_FPS;
  video: RenderVideoSequence[];
  overlay: RenderOverlay[];
  captions: RenderCaption[];
  audio: RenderAudioLayer[];
  transitions: RenderTransition[];
  drawOrder?: ["video", "overlay", "captions", "titleBar", "watermark"];
  titleBar?: { visible: boolean; text: string; height: number; font: string; fontSize: number; color: string; bgColor: string; bgOpacity: number; opacity: number };
  watermark?: { visible: boolean; file: string; x: number; y: number; width: number; opacity: number };
  durationInFrames: number;
}

const frame = (seconds: number) => Math.round(seconds * RENDER_FPS);
const volume = (gain: { gain: number; muted: boolean }, clipGain = 1) => gain.muted ? 0 : gain.gain * clipGain;
const NO_TRANSITION: ClipTransition = { kind: { kind: "none" }, durationSec: 0.5 };

function transition(clip: { startTransition?: ClipTransitionInput; endTransition?: ClipTransitionInput }, edge: "start" | "end", durationSec: number): ClipTransition {
  const value = clip[edge === "start" ? "startTransition" : "endTransition"];
  return value ? { kind: value.kind, durationSec: Math.min(2, durationSec / 2, Math.max(0.1, value.durationSec ?? 0.5)) } : NO_TRANSITION;
}

function transitionProps(clip: { startTransition?: ClipTransitionInput; endTransition?: ClipTransitionInput }, durationSec: number) {
  return {
    ...(clip.startTransition ? { startTransition: transition(clip, "start", durationSec) } : {}),
    ...(clip.endTransition ? { endTransition: transition(clip, "end", durationSec) } : {}),
  };
}

function boundaryTransition(left: ClipTransition, right: ClipTransition): ClipTransition {
  const leftActive = left.kind.kind !== "none";
  const rightActive = right.kind.kind !== "none";
  if (leftActive && rightActive && left.kind.kind === "dissolve" && right.kind.kind === "dissolve") {
    return left.durationSec >= right.durationSec ? left : right;
  }
  if (rightActive) return right;
  return leftActive ? left : NO_TRANSITION;
}

export interface RenderBrandSettings {
  watermark?: { file: string; x: number; y: number; width: number; opacity: number };
  titleBar?: { height: number; bgColor: string; bgOpacity: number; font: string; fontSize: number; color: string };
}

export function timelineToRender(timeline: Timeline, brand?: RenderBrandSettings): RenderTimeline {
  let cursorSec = 0;
  const video: RenderVideoSequence[] = [];
  const audio: RenderAudioLayer[] = [];
  const transitions: RenderTransition[] = [];
  const mainBounds: { id: string; startFrame: number; endFrame: number; durationInFrames: number; kind: "main" | "meme" }[] = [];
  const stems = timeline.audio.stems ?? {};

  for (const clip of timeline.video) {
    const durationSec = clipDuration(clip);
    const startFrame = frame(cursorSec);
    const endFrame = frame(cursorSec + durationSec);
    const durationInFrames = endFrame - startFrame;
    if ("durationSec" in clip && clip.kind === "meme") {
      video.push({ id: clip.id, kind: "meme", startFrame, durationInFrames, memeId: clip.memeId, ...(clip.opacity !== undefined ? { opacity: clip.opacity } : {}), ...transitionProps(clip, durationSec) });
      mainBounds.push({ id: clip.id, startFrame, endFrame, durationInFrames, kind: "meme" });
      audio.push({ id: `${clip.id}-audio`, track: "meme", startFrame, durationInFrames, sourceStartFrame: 0, volume: volume(timeline.audio.source), inputId: clip.memeId });
    } else if ("durationSec" in clip) {
      video.push({ id: clip.id, kind: "main", startFrame, durationInFrames, inputId: clip.inputId, ...(clip.opacity !== undefined ? { opacity: clip.opacity } : {}), ...transitionProps(clip, durationSec) });
      mainBounds.push({ id: clip.id, startFrame, endFrame, durationInFrames, kind: "main" });
    } else {
      video.push({ id: clip.id, kind: "main", startFrame, durationInFrames, inputId: clip.inputId, sourceStartFrame: frame(clip.inStartSec), ...(clip.opacity !== undefined ? { opacity: clip.opacity } : {}), ...transitionProps(clip, durationSec) });
      mainBounds.push({ id: clip.id, startFrame, endFrame, durationInFrames, kind: "main" });
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

  const layers = timeline.captionLayers ?? [{ id: "caption-layer-1", name: "자막", x: 0.5, y: 1555 / 1920, style: { font: "pretendard" as const, mainSize: 56, subSize: 40, color: "#FFFFFF", textOpacity: 1, bar: true, barColor: "#000000", barOpacity: 0.62 }, main: timeline.captions ?? [], sub: [] }];
  const captions = layers.flatMap((layer, layerIndex) => [
    ...layer.main.map((clip) => ({ id: clip.id, layerId: layer.id, layer: layerIndex, row: "main" as const, startFrame: frame(clip.startSec), durationInFrames: frame(clip.endSec) - frame(clip.startSec), text: clip.text, x: layer.x, y: layer.y, opacity: (clip.opacity ?? 1) * (layer.opacity ?? 1) * layer.style.textOpacity, clipOpacity: clip.opacity ?? 1, layerOpacity: layer.opacity ?? 1, textOpacity: layer.style.textOpacity, barOpacity: layer.style.barOpacity, style: layer.style })),
    ...layer.sub.map((clip) => ({ id: clip.id, layerId: layer.id, layer: layerIndex, row: "sub" as const, startFrame: frame(clip.startSec), durationInFrames: frame(clip.endSec) - frame(clip.startSec), text: clip.text, x: layer.x, y: layer.y, opacity: (clip.opacity ?? 1) * (layer.opacity ?? 1) * layer.style.textOpacity, clipOpacity: clip.opacity ?? 1, layerOpacity: layer.opacity ?? 1, textOpacity: layer.style.textOpacity, barOpacity: layer.style.barOpacity, style: layer.style })),
  ]);
  const overlay = timeline.overlays.flatMap((layer, layerIndex) => layer.map((clip: OverlayClip): RenderOverlay => ({
    id: clip.id,
    layer: layerIndex,
    kind: "memeId" in clip ? "meme" : clip.kind,
    startFrame: frame(clip.startSec),
    durationInFrames: frame(overlayDuration(clip)),
    ...( "memeId" in clip ? { memeId: clip.memeId } : { inputId: clip.inputId, ...(clip.kind === "video" ? { sourceStartFrame: frame(clip.inStartSec) } : {}) }),
    x: clip.x, y: clip.y, width: clip.width, ...(clip.opacity !== undefined ? { opacity: clip.opacity } : {}),
    ...transitionProps(clip, overlayDuration(clip)),
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

  const audioForClip = (id: string) => audio.filter((layer) => layer.id.startsWith(`${id}-`) && layer.track !== "meme");
  const addVolumeTransition = (clipId: string, value: RenderVolumeTransition) => {
    for (const layer of audioForClip(clipId)) layer.volumeTransitions = [...(layer.volumeTransitions ?? []), value];
  };
  for (let index = 1; index < mainBounds.length; index++) {
    const left = mainBounds[index - 1]!;
    const right = mainBounds[index]!;
    const leftClip = timeline.video[index - 1]!;
    const rightClip = timeline.video[index]!;
    const effect = boundaryTransition(transition(leftClip, "end", clipDuration(leftClip)), transition(rightClip, "start", clipDuration(rightClip)));
    if (effect.kind.kind === "none") continue;
    const effectFrames = Math.min(frame(effect.durationSec), Math.floor(left.durationInFrames / 2), Math.floor(right.durationInFrames / 2));
    if (effectFrames < 1) continue;
    const startFrame = right.startFrame - Math.floor(effectFrames / 2);
    const leftSequence = video.find((clip) => clip.id === left.id)!;
    const rightSequence = video.find((clip) => clip.id === right.id)!;
    const beforeFrames = Math.floor(effectFrames / 2);
    const afterFrames = effectFrames - beforeFrames;
    const item: RenderTransition = {
      id: `${left.id}-${right.id}-${effect.kind.kind}`, fromId: left.id, toId: right.id,
      startFrame, durationInFrames: effectFrames, kind: effect.kind, playbackRate: 0.5,
      ...(leftSequence.sourceStartFrame !== undefined ? { fromSourceStartFrame: leftSequence.sourceStartFrame + left.durationInFrames - beforeFrames } : {}),
      ...(rightSequence.sourceStartFrame !== undefined ? { toSourceStartFrame: rightSequence.sourceStartFrame } : {}),
    };
    transitions.push(item);
    if (effect.kind.kind === "dissolve") {
      addVolumeTransition(left.id, { startFrame, durationInFrames: effectFrames, from: 1, to: 0 });
      addVolumeTransition(right.id, { startFrame, durationInFrames: effectFrames, from: 0, to: 1 });
      for (const layer of audioForClip(left.id)) layer.durationInFrames += afterFrames;
      for (const layer of audioForClip(right.id)) { layer.startFrame -= beforeFrames; layer.durationInFrames += beforeFrames; }
    }
  }
  const first = mainBounds[0];
  if (first) {
    const effect = transition(timeline.video[0]!, "start", clipDuration(timeline.video[0]!));
    if (effect.kind.kind !== "none") {
      const durationInFrames = Math.min(frame(effect.durationSec), Math.floor(first.durationInFrames / 2));
      if (durationInFrames > 0) {
        const sequence = video.find((clip) => clip.id === first.id)!;
        transitions.push({ id: `${first.id}-start-${effect.kind.kind}`, fromId: null, toId: first.id, startFrame: 0, durationInFrames, kind: effect.kind, playbackRate: 1, ...(sequence.sourceStartFrame !== undefined ? { toSourceStartFrame: sequence.sourceStartFrame } : {}) });
      }
    }
  }
  const last = mainBounds.at(-1);
  if (last) {
    const effect = transition(timeline.video.at(-1)!, "end", clipDuration(timeline.video.at(-1)!));
    if (effect.kind.kind !== "none") {
      const durationInFrames = Math.min(frame(effect.durationSec), Math.floor(last.durationInFrames / 2));
      if (durationInFrames > 0) {
        const sequence = video.find((clip) => clip.id === last.id)!;
        const sourceEnd = sequence.sourceStartFrame === undefined ? undefined : sequence.sourceStartFrame + last.durationInFrames - durationInFrames;
        transitions.push({ id: `${last.id}-end-${effect.kind.kind}`, fromId: last.id, toId: null, startFrame: last.endFrame - durationInFrames, durationInFrames, kind: effect.kind, playbackRate: 1, ...(sourceEnd !== undefined ? { fromSourceStartFrame: sourceEnd } : {}) });
      }
    }
  }
  const adjustedBounds = new Map(mainBounds.map((bound) => [bound.id, { startFrame: bound.startFrame, endFrame: bound.endFrame, sourceShift: 0 }]));
  for (const item of transitions) {
    if (item.fromId) {
      const bounds = adjustedBounds.get(item.fromId)!;
      bounds.endFrame = Math.min(bounds.endFrame, item.startFrame);
    }
    if (item.toId) {
      const bounds = adjustedBounds.get(item.toId)!;
      const nextStart = item.startFrame + item.durationInFrames;
      bounds.sourceShift += Math.max(0, nextStart - bounds.startFrame);
      bounds.startFrame = Math.max(bounds.startFrame, nextStart);
    }
  }
  for (const [id, bounds] of adjustedBounds) {
    const sequence = video.find((clip) => clip.id === id)!;
    sequence.startFrame = bounds.startFrame;
    sequence.durationInFrames = Math.max(0, bounds.endFrame - bounds.startFrame);
    if (sequence.sourceStartFrame !== undefined) sequence.sourceStartFrame += bounds.sourceShift;
    sequence.startTransition = NO_TRANSITION;
    sequence.endTransition = NO_TRANSITION;
  }
  const durationInFrames = Math.max(
    frame(cursorSec),
    ...captions.map((clip) => clip.startFrame + clip.durationInFrames),
    ...audio.map((layer) => layer.startFrame + layer.durationInFrames),
  );
  const titleConfig = brand?.titleBar;
  const title = timeline.brand?.titleBar;
  const titleText = title?.text ?? "";
  const titleVisible = title?.enabled ?? Boolean(titleText);
  const watermarkConfig = brand?.watermark;
  const watermark = timeline.brand?.watermark;
  const watermarkVisible = watermark?.enabled ?? Boolean(watermarkConfig?.file);
  return {
    fps: RENDER_FPS, video, overlay, captions, audio, transitions, durationInFrames,
    drawOrder: ["video", "overlay", "captions", "titleBar", "watermark"],
    ...(titleConfig ? { titleBar: { visible: titleVisible && Boolean(titleText), text: titleText, height: title?.height ?? titleConfig.height, font: titleConfig.font, fontSize: title?.fontSize ?? titleConfig.fontSize, color: titleConfig.color, bgColor: titleConfig.bgColor, bgOpacity: titleConfig.bgOpacity, opacity: title?.opacity ?? 1 } } : {}),
    ...(watermarkConfig?.file ? { watermark: { visible: watermarkVisible, file: watermarkConfig.file, x: watermark?.x ?? watermarkConfig.x, y: watermark?.y ?? watermarkConfig.y, width: watermark?.width ?? watermarkConfig.width, opacity: watermark?.opacity ?? watermarkConfig.opacity } } : {}),
  };
}
