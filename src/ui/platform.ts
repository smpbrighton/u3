import type { Platform } from "../core/studio-shortcuts";

export function uiPlatform(): Platform {
  return typeof navigator !== "undefined" && navigator.platform.startsWith("Mac") ? "mac" : "win";
}
