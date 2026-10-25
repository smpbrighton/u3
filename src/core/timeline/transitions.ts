import type { TransitionKind } from "../schema";

export type TransitionEdge = "start" | "end";
export interface TransitionStyle {
  opacity: number;
  transform: string;
  clipPath: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function wipeClip(direction: "left" | "right" | "up" | "down", progress: number): string {
  const hidden = `${Math.round((1 - progress) * 100)}%`;
  if (direction === "left") return `inset(0 ${hidden} 0 0)`;
  if (direction === "right") return `inset(0 0 0 ${hidden})`;
  if (direction === "up") return `inset(0 0 ${hidden} 0)`;
  return `inset(${hidden} 0 0 0)`;
}

export function transitionStyleAt(kind: TransitionKind, progressValue: number, edge: TransitionEdge): TransitionStyle {
  const progress = clamp(progressValue);
  const visible = edge === "start" ? progress : 1 - progress;
  if (kind.kind === "none") return { opacity: 1, transform: "translate(0, 0) scale(1)", clipPath: "inset(0 0 0 0)" };
  if (kind.kind === "dissolve" || kind.kind === "black-fade") return { opacity: visible, transform: "translate(0, 0) scale(1)", clipPath: "inset(0 0 0 0)" };
  if (kind.kind === "slide") {
    const distance = (edge === "start" ? 1 - progress : progress) * 100;
    const directionSign = kind.direction === "left" || kind.direction === "up" ? -1 : 1;
    const movement = edge === "start" ? directionSign : -directionSign;
    const x = kind.direction === "left" || kind.direction === "right" ? movement * distance : 0;
    const y = kind.direction === "up" || kind.direction === "down" ? movement * distance : 0;
    return { opacity: 1, transform: `translate(${x}%, ${y}%) scale(1)`, clipPath: "inset(0 0 0 0)" };
  }
  if (kind.kind === "wipe") return { opacity: 1, transform: "translate(0, 0) scale(1)", clipPath: wipeClip(kind.direction, visible) };
  if (kind.kind === "iris") return { opacity: 1, transform: "translate(0, 0) scale(1)", clipPath: `circle(${Math.round(150 * visible)}% at 50% 50%)` };
  const scale = edge === "start" ? 1.2 - 0.2 * progress : 1 + 0.2 * progress;
  return { opacity: 1, transform: `translate(0, 0) scale(${scale})`, clipPath: "inset(0 0 0 0)" };
}

export function transitionProgressAt(frame: number, startFrame: number, durationInFrames: number): number {
  if (!Number.isFinite(frame) || !Number.isFinite(startFrame) || !Number.isFinite(durationInFrames) || durationInFrames <= 0) return 0;
  return clamp((frame - startFrame) / durationInFrames);
}
