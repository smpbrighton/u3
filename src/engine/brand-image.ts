import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const MAX_BRAND_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BRAND_IMAGE_DIMENSION = 8192;

function dimensions(bytes: Buffer, extension: string): { width: number; height: number } | null {
  if (extension === ".png") {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension === ".webp") {
    if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]!;
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }
  return null;
}

export async function validateBrandImage(file: string): Promise<{ extension: ".png" | ".jpg" | ".webp"; size: number }> {
  const extension = path.extname(file).toLowerCase();
  if (extension !== ".png" && extension !== ".jpg" && extension !== ".jpeg" && extension !== ".webp") throw new Error("워터마크는 PNG, JPG, WebP 파일만 사용할 수 있습니다");
  const info = await stat(file);
  if (!info.isFile() || info.size === 0 || info.size > MAX_BRAND_IMAGE_BYTES) throw new Error("워터마크 파일은 10 MB 이하이어야 합니다");
  const bytes = await readFile(file);
  if (bytes.length !== info.size) throw new Error("워터마크 파일을 확인할 수 없습니다");
  const size = dimensions(bytes, extension);
  if (!size || size.width < 1 || size.height < 1 || size.width > MAX_BRAND_IMAGE_DIMENSION || size.height > MAX_BRAND_IMAGE_DIMENSION) {
    throw new Error("워터마크 이미지의 형식 또는 크기가 올바르지 않습니다");
  }
  return { extension: extension === ".jpeg" ? ".jpg" : extension, size: bytes.length };
}
