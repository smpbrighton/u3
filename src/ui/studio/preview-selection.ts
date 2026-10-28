import type { CaptionLayer, CaptionStyle } from "../../core/schema";
import { captionTargetBox } from "../../core/preview-geometry";

export function captionSelectionBox(layer: CaptionLayer, sec: number, measure: (text: string, style: CaptionStyle, row: "main" | "sub", scale: number) => { width: number; height: number }) {
  const sizes = (["main", "sub"] as const).flatMap(row => {
    const clip = layer[row].find(c => c.startSec <= sec && c.endSec > sec);
    return clip ? [measure(clip.text, layer.style, row, clip.style?.sizeScale ?? 1)] : [];
  });
  return sizes.length ? captionTargetBox(layer, { width: Math.max(...sizes.map(s => s.width)), height: sizes.reduce((sum, s) => sum + s.height, 0) }) : null;
}
