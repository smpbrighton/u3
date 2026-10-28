import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { audioVersion, prepareSpeedAudio } from "../../src/engine/pipeline/audio-speed";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(require.resolve("@remotion/renderer"));
const binDir = rendererRequire("@remotion/compositor-darwin-arm64").dir as string;
const ffmpeg = path.join(binDir, "ffmpeg");
vi.stubEnv("FFMPEG_BIN", ffmpeg); vi.stubEnv("FFPROBE_BIN", path.join(binDir, "ffprobe"));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
function tone(seconds = 2) {
  const rate = 48000, count = Math.round(seconds * rate), b = Buffer.alloc(44 + count * 2);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) b.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return b;
}
describe.skipIf(!existsSync(ffmpeg))("047 번들 ffmpeg 음성 배속", () => {
  it("0.5·1.25·2배의 길이·주파수·캐시 재사용·원본 보존을 실제로 측정한다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-audio-speed-")); roots.push(root);
    const sourceAbs = path.join(root, "tone.wav"), original = tone(); await writeFile(sourceAbs, original);
    for (const speed of [0.5, 1.25, 2]) {
      const result = await prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed });
      expect(Math.abs(result.durationSec - 2 / speed)).toBeLessThanOrEqual(1 / 30);
      const pcm = execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", path.join(root, result.file), "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1"], { cwd: binDir });
      let crossings = 0; const start = 4800, end = pcm.length / 2 - 4800;
      for (let i = start + 1; i < end; i++) if (pcm.readInt16LE((i - 1) * 2) <= 0 && pcm.readInt16LE(i * 2) > 0) crossings++;
      const hz = crossings * 48000 / (end - start);
      console.log(`047 bundled ffmpeg speed=${speed} duration=${result.durationSec.toFixed(6)}s expected=${(2 / speed).toFixed(6)}s frequency=${hz.toFixed(3)}Hz`);
      expect(Math.abs(hz - 440) / 440).toBeLessThanOrEqual(0.01);
      const before = (await stat(path.join(root, result.file))).mtimeMs;
      expect(await prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed })).toEqual(result);
      expect((await stat(path.join(root, result.file))).mtimeMs).toBe(before);
    }
    expect(await readFile(sourceAbs)).toEqual(original);
    const version = await audioVersion(sourceAbs); await writeFile(sourceAbs, tone(3));
    expect(await audioVersion(sourceAbs)).not.toBe(version);
    const next = await prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed: 2 });
    expect(next.durationSec).toBeCloseTo(1.5, 1);
  });
  it("실패·취소는 임시 파일만 없애고 1배속은 원본을 사용한다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-audio-failure-")); roots.push(root);
    const sourceAbs = path.join(root, "tone.wav"); await writeFile(sourceAbs, tone());
    expect((await prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed: 1 })).file).toBe("tone.wav");
    const controller = new AbortController(); controller.abort();
    await expect(prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed: 2, signal: controller.signal })).rejects.toThrow();
    await writeFile(sourceAbs, "broken");
    await expect(prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed: 2 })).rejects.toThrow();
    expect((await readdir(path.join(root, "cache/audio")).catch(() => [])).filter(f => f.startsWith(".tmp"))).toEqual([]);
    expect(await readFile(sourceAbs, "utf8")).toBe("broken");
  });
});
