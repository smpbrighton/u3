export const CANVAS = { width: 1080, height: 1920, fps: 30 } as const;
export const CENTER_X = CANVAS.width / 2;
export const RIGHT_RAIL_TOP = 1024;
export const SAFE_ZONE = { top: 200, bottom: 1480, margin: 60, railMargin: 160 } as const;
export const SAFE_WIDTH = CANVAS.width - 2 * SAFE_ZONE.margin;
export const RAIL_SAFE_WIDTH = CANVAS.width - 2 * SAFE_ZONE.railMargin;
export const EFFECT_MAX = { scale: 1.08, shakePx: 12 } as const;
export interface Box { x: number; y: number; width: number; height: number }
export const boxRight = (box: Box) => box.x + box.width;
export const boxBottom = (box: Box) => box.y + box.height;
export function inflateForEffects(box: Box, max: { scale: number; shakePx: number } = EFFECT_MAX): Box {
  const width = box.width * max.scale + 2 * max.shakePx;
  const height = box.height * max.scale + 2 * max.shakePx;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}
export function maxStaticSize(limit: number, max: { scale: number; shakePx: number } = EFFECT_MAX): number {
  return Math.floor((limit - 2 * max.shakePx) / max.scale);
}
const EPS = 1e-6;
export function sideMarginFor(box: Box): number { return boxBottom(box) > RIGHT_RAIL_TOP + EPS ? SAFE_ZONE.railMargin : SAFE_ZONE.margin; }
export function centeredBox(cx: number, cy: number, width: number, height: number): Box { return { x: cx - width / 2, y: cy - height / 2, width, height }; }
