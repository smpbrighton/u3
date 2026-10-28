import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { buildPlatform } from "../../scripts/build-platforms";

export const mediaPlatform = buildPlatform(process.platform, process.arch);
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(require.resolve("@remotion/renderer"));
export const mediaBinDir = rendererRequire(mediaPlatform.compositor).dir as string;
export const ffmpegBin = path.join(mediaBinDir, `ffmpeg${mediaPlatform.extension}`);
export const ffprobeBin = path.join(mediaBinDir, `ffprobe${mediaPlatform.extension}`);

export function ffmpeg(args: string[]): Buffer {
  return execFileSync(ffmpegBin, ["-hide_banner", "-loglevel", "error", ...args], { cwd: mediaBinDir, maxBuffer: 64 * 1024 * 1024 });
}

/** color 필터 없이 Node에서 RGB PNG fixture를 만든다. */
export function solidPng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(type), data]);
    const result = Buffer.alloc(12 + data.length);
    result.writeUInt32BE(data.length);
    payload.copy(result, 4);
    result.writeUInt32BE(crc32(payload), result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8-bit RGB, non-interlaced
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2];
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

export function toneWav(seconds = 2): Buffer {
  const rate = 48000, count = Math.round(seconds * rate), b = Buffer.alloc(44 + count * 2);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) b.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return b;
}
