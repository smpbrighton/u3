import type { OverlayClip } from "../schema";

export type OverlayLayers = OverlayClip[][];

function duration(clip: OverlayClip): number {
  return "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
}

function overlaps(a: OverlayClip, b: OverlayClip): boolean {
  return a.startSec < b.startSec + duration(b) && a.startSec + duration(a) > b.startSec;
}

export function placeOverlayInLowestLayer(layers: readonly (readonly OverlayClip[])[], clip: OverlayClip): OverlayLayers {
  const compact = layers.filter((layer) => layer.length > 0);
  const targetIndex = compact.findIndex((layer) => layer.every((existing) => !overlaps(existing, clip)));
  if (targetIndex < 0) return [...compact.map((layer) => [...layer]), [clip]];
  return compact.map((layer, index) => index === targetIndex ? [...layer, clip] : [...layer]);
}

export function placeOverlayAtLayer(layers: readonly (readonly OverlayClip[])[], clip: OverlayClip, targetLayer: number): OverlayLayers {
  const compact = layers.filter((layer) => layer.length > 0).map((layer) => [...layer]);
  const index = Math.max(0, Math.trunc(targetLayer));
  if (index >= compact.length) {
    if (index === compact.length) return [...compact, [clip]];
    return placeOverlayInLowestLayer(compact, clip);
  }
  if (compact[index]!.every((existing) => !overlaps(existing, clip))) {
    compact[index]!.push(clip);
    return compact;
  }
  return placeOverlayInLowestLayer(compact, clip);
}

export function removeOverlayFromLayers(layers: readonly (readonly OverlayClip[])[], clipId: string): OverlayLayers {
  return layers.map((layer) => layer.filter((clip) => clip.id !== clipId)).filter((layer) => layer.length > 0).map((layer) => [...layer]);
}

export function updateOverlayInLayers(layers: readonly (readonly OverlayClip[])[], clipId: string, update: (clip: OverlayClip) => OverlayClip): OverlayLayers {
  return layers.map((layer) => layer.map((clip) => clip.id === clipId ? update(clip) : clip));
}

export function findOverlayInLayers(layers: readonly (readonly OverlayClip[])[], clipId: string): { clip: OverlayClip; layer: number } | undefined {
  for (let layer = 0; layer < layers.length; layer++) {
    const clip = layers[layer]!.find((item) => item.id === clipId);
    if (clip) return { clip, layer };
  }
  return undefined;
}
