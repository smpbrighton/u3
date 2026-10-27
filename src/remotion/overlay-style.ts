import type { CSSProperties } from "react";
import { CANVAS } from "../core/geometry";
import type { TransitionStyle } from "../core/timeline/transitions";

export function overlayMediaStyle(
  clip: { x: number; y: number; width: number },
  edge: TransitionStyle,
  /** 미디어 높이/폭(픽셀). 알면 창 높이를 정해 canvas 비율이 미디어와 어긋나지 않게 한다. */
  aspect?: number,
): CSSProperties {
  return {
    position: "absolute",
    left: `${clip.x * 100}%`,
    top: `${clip.y * 100}%`,
    width: `${clip.width * 100}%`,
    height: aspect ? `${clip.width * aspect * CANVAS.width / CANVAS.height * 100}%` : "auto",
    transform: `translate(-50%, -50%) ${edge.transform}`,
    opacity: edge.opacity,
    clipPath: edge.clipPath,
    overflow: "hidden",
    display: "block",
  };
}
