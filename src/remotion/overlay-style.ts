import type { CSSProperties } from "react";
import type { TransitionStyle } from "../core/timeline/transitions";

export function overlayMediaStyle(
  clip: { x: number; y: number; width: number },
  edge: TransitionStyle,
): CSSProperties {
  return {
    position: "absolute",
    left: `${clip.x * 100}%`,
    top: `${clip.y * 100}%`,
    width: `${clip.width * 100}%`,
    height: "auto",
    transform: `translate(-50%, -50%) ${edge.transform}`,
    opacity: edge.opacity,
    clipPath: edge.clipPath,
    overflow: "hidden",
    display: "block",
  };
}
