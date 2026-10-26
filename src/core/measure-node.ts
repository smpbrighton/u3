import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_FILES } from "./fonts";
import { createMeasurer, type FontData, type Measurer } from "./measure";

const defaultFontDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
let shared: { directory: string; measurer: Measurer } | null = null;

/** Node에서 U3_FONT_DIR 또는 레포 assets/fonts의 폰트를 읽어 자막 측정기를 만든다. */
export function loadMeasurer(fontDir = process.env.U3_FONT_DIR ?? defaultFontDir): Measurer {
  const directory = path.resolve(fontDir);
  if (shared?.directory === directory) return shared.measurer;
  const fonts: FontData[] = FONT_FILES.map((font) => {
    const buffer = readFileSync(path.join(directory, path.basename(font.file)));
    return {
      role: font.role,
      weight: Number(font.weight),
      ...("key" in font ? { key: font.key } : {}),
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    };
  });
  const measurer = createMeasurer(fonts);
  shared = { directory, measurer };
  return measurer;
}
