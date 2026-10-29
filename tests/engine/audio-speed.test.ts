import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { audioVersion, prepareSpeedAudio } from "../../src/engine/pipeline/audio-speed";
import { ffmpegBin as ffmpeg, ffprobeBin, toneWav as tone } from "../helpers/media";

vi.stubEnv("FFMPEG_BIN", ffmpeg); vi.stubEnv("FFPROBE_BIN", ffprobeBin);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
describe.skipIf(!existsSync(ffmpeg))("047 번들 ffmpeg 음성 배속", () => {
  it("0.5·1.25·2배의 길이·주파수·캐시 재사용·원본 보존을 실제로 측정한다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-audio-speed-")); roots.push(root);
    const sourceAbs = path.join(root, "tone.wav"), original = tone(); await writeFile(sourceAbs, original);
    for (const speed of [0.5, 1.25, 2]) {
      const result = await prepareSpeedAudio({ projectDir: root, sourceAbs, sourceId: "tone", speed });
      expect(Math.abs(result.durationSec - 2 / speed)).toBeLessThanOrEqual(1 / 30);
      const wav = await readFile(path.join(root, result.file));
      let pcm = Buffer.alloc(0);
      for (let offset = 12; offset + 8 <= wav.length;) {
        const size = wav.readUInt32LE(offset + 4);
        if (wav.toString("ascii", offset, offset + 4) === "data") { pcm = wav.subarray(offset + 8, offset + 8 + size); break; }
        offset += 8 + size + size % 2;
      }
      expect(pcm.length).toBeGreaterThan(0);
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
  }, 30_000);
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
