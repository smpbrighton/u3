import type { CarouselTextObject } from "../../../core/carousel";

const ratio = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
export function transformText(text: CarouselTextObject, dx: number, dy: number, resize: boolean): CarouselTextObject {
  return resize ? { ...text, width: Math.max(0.01, ratio(text.width + dx)) } : { ...text, x: ratio(text.x + dx), y: ratio(text.y + dy) };
}
