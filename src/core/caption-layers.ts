import { DEFAULT_CAPTION_STYLE, captionLayersOf, withCaptionLayers, type CaptionLayer, type Timeline } from "./schema";

export function swapCaptionRows<T extends Pick<CaptionLayer, "main" | "sub">>(layer: T): T {
  return { ...layer, main: layer.sub, sub: layer.main };
}

export function addCaptionLayer(timeline: Timeline): Timeline {
  const layers = captionLayersOf(timeline);
  const number = layers.length + 1;
  return withCaptionLayers(timeline, [...layers, {
    id: `caption-layer-${Date.now()}-${number}`, name: `자막 ${number}`, x: 0.5, y: 1480 / 1920,
    style: { ...DEFAULT_CAPTION_STYLE }, main: [], sub: [],
  }]);
}

export function deleteCaptionLayer(timeline: Timeline, id: string): Timeline {
  const layers = captionLayersOf(timeline);
  if (layers.length <= 1) return timeline;
  return withCaptionLayers(timeline, layers.filter(layer => layer.id !== id));
}

export function replaceCaptionSubtitles(timeline: Timeline, layerId: string, captions: Array<{ id: string; text: string }>): Timeline {
  const layers = captionLayersOf(timeline);
  return withCaptionLayers(timeline, layers.map(layer => layer.id === layerId ? {
    ...layer,
    sub: captions.flatMap((caption) => {
      const main = layer.main.find(item => item.id === caption.id);
      return main ? [{ id: `sub-${caption.id}`, startSec: main.startSec, endSec: main.endSec, text: caption.text }] : [];
    }),
  } : layer));
}
