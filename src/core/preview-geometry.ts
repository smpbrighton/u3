import { CANVAS, SAFE_ZONE, sideMarginFor, type Box } from "./geometry";
import { pushHistory, type TimelineHistory } from "./timeline/history";
import type { Timeline } from "./schema";

export interface ScreenRect { left: number; top: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface NormalizedBox { x: number; y: number; width: number; height: number }
export interface PreviewTarget<T = unknown> { id: string; box: NormalizedBox; value?: T }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function screenToNormalized(point: Point, rect: ScreenRect): Point {
  return { x: (point.x - rect.left) / rect.width, y: (point.y - rect.top) / rect.height };
}

export function normalizedToScreen(point: Point, rect: ScreenRect): Point {
  return { x: rect.left + point.x * rect.width, y: rect.top + point.y * rect.height };
}

export function resizeNormalizedBox(box: NormalizedBox, deltaX: number, containerWidth: number, minWidth = 0.05): NormalizedBox {
  return { ...box, width: clamp(box.width + deltaX / containerWidth, minWidth, 1) };
}

export function snapBoxToSafeZone(box: Box): Box {
  const margin = sideMarginFor(box);
  const maxWidth = CANVAS.width - margin * 2;
  const width = Math.min(box.width, maxWidth);
  const x = clamp(box.x, margin, CANVAS.width - margin - width);
  const y = clamp(box.y, SAFE_ZONE.top, Math.max(SAFE_ZONE.top, SAFE_ZONE.bottom - box.height));
  return { ...box, x, y, width };
}

export function limitBoxBelowTitleBar(box: NormalizedBox, titleBarHeight: number, canvasHeight = CANVAS.height): NormalizedBox {
  const minY = titleBarHeight / canvasHeight;
  return { ...box, y: clamp(box.y, minY, Math.max(minY, 1 - box.height)) };
}

export function pickTopTarget<T extends PreviewTarget>(targets: readonly T[], point: Point): T | undefined {
  return [...targets].reverse().find(({ box }) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
}

export function recordPreviewDrag(history: TimelineHistory, finalTimeline: Timeline): TimelineHistory {
  return pushHistory(history, finalTimeline);
}
