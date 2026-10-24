import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { FONT_FILES } from "../core/fonts";

export { FONT_FAMILY, FONT_FILES } from "../core/fonts";

let pending: Promise<void> | null = null;

export function ensureFonts(): Promise<void> {
  if (!pending) {
    pending = Promise.all(FONT_FILES.map((font) => loadFont({ family: font.family, weight: font.weight, url: staticFile(font.file) }))).then(() => undefined);
  }
  return pending;
}
