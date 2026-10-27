import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runTts } from "../../src/engine/pipeline/tts";
import { fakeTts } from "../helpers/tts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function options(mode: Parameters<typeof fakeTts>[1] = "ok") {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-tts-run-")); roots.push(root);
  return { root, binary: await fakeTts(root, mode), metallib: path.join(root, "default.metallib"), modelDir: path.join(root, "model"), speaker: "Sohee", instruct: "밝게", items: ["a", "b", "c"].map(id => ({ id, text: `문장 ${id}` })), outDir: path.join(root, "output") };
}

describe("Swift TTS 실행", () => {
  it("한 프로세스로 3개 WAV를 받고 Resources 인자와 256MB 한도를 전달한다", async () => {
    const input = await options(); const progress: number[] = [];
    const result = await runTts({ ...input, onProgress: value => progress.push(value) });
    expect(result.map(item => [item.id, item.durationSec])).toEqual([["a", 1], ["b", 1], ["c", 1]]);
    const request = JSON.parse(await readFile(path.join(input.root, "request.json"), "utf8"));
    expect(request).toMatchObject({ model: input.modelDir, speaker: "Sohee", instruct: "밝게", items: input.items, outDir: input.outDir });
    expect(request.args).toEqual(["--metallib", input.metallib, "--cache-limit-mb", "256"]);
    expect(progress).toContain(1);
  });

  it("취소하면 프로세스 종료를 기다리고 부분 WAV를 지운다", async () => {
    const input = await options("hang"); const controller = new AbortController();
    await expect(runTts({ ...input, signal: controller.signal, onProgress: value => { if (value > 0) controller.abort(); } })).rejects.toThrow(/취소/);
    await expect(readFile(path.join(input.outDir, "a.wav"))).rejects.toThrow();
    const request = JSON.parse(await readFile(path.join(input.root, "request.json"), "utf8"));
    expect(() => process.kill(request.pid, 0)).toThrow();
  });

  it.each(["fail", "incomplete"] as const)("%s 출력은 성공으로 처리하지 않고 WAV를 지운다", async mode => {
    const input = await options(mode);
    await expect(runTts(input)).rejects.toThrow();
    await expect(readFile(path.join(input.outDir, "a.wav"))).rejects.toThrow();
  });
});
