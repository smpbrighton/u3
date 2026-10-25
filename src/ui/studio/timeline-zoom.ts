export const MIN_TIMELINE_ZOOM = 1;
export const MAX_TIMELINE_ZOOM = 10;

export function clampTimelineZoom(zoom: number): number {
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, zoom));
}

export function scaleWidthForZoom(zoom: number): number {
  return 48 + (clampTimelineZoom(zoom) - 1) * 18;
}

export function zoomFromWheel(zoom: number, deltaY: number): number {
  return clampTimelineZoom(zoom * Math.exp(-deltaY * 0.002));
}

export function zoomFromPinch(zoom: number, scale: number): number {
  return clampTimelineZoom(zoom * scale);
}

export function secondsToPixels(seconds: number, scaleWidth: number): number {
  return seconds * scaleWidth;
}

export function pixelsToSeconds(pixels: number, scaleWidth: number): number {
  return pixels / scaleWidth;
}

export function timelinePointerSeconds(clientX: number, gridLeft: number, scrollLeft: number, zoom: number): number {
  return pixelsToSeconds(clientX - gridLeft - 20 + scrollLeft, scaleWidthForZoom(zoom));
}

export function scrollLeftForZoomAnchor(
  scrollLeft: number,
  pointerX: number,
  previousZoom: number,
  nextZoom: number,
): number {
  const timeAtPointer = pixelsToSeconds(scrollLeft + pointerX, previousZoom);
  return Math.max(0, secondsToPixels(timeAtPointer, nextZoom) - pointerX);
}
