import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_FILES } from "./fonts";
import { createMeasurer, type FontData, type Measurer } from "./measure";

const defaultAssetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
let shared: Measurer | null = null;

/** Node에서 assets/fonts 파일을 읽어 자막 측정기를 만든다. */
export function loadMeasurer(assetsDir = defaultAssetsDir): Measurer {
  if (assetsDir === defaultAssetsDir && shared) return shared;
  const fonts: FontData[] = FONT_FILES.map((font) => {
    const buffer = readFileSync(path.join(assetsDir, font.file));
    return {
      role: font.role,
      weight: Number(font.weight),
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    };
  });
  const measurer = createMeasurer(fonts);
  if (assetsDir === defaultAssetsDir) shared = measurer;
  return measurer;
}
