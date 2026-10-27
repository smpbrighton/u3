import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { downloadModelFile, downloadQwenTts, QWEN_TTS_FILES, QWEN_TTS_MODEL_DIR, qwenTtsReady } from "../../src/engine/pipeline/models";

describe("model downloader", () => {
  it("TTS는 고정 8bit revision만 받고 검증한 tokenizer를 복사한다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-qwen-model-"));
    const bytes = Buffer.from("model bytes"); const tokenizer = Buffer.from("tokenizer bytes");
    const tokenizerPath = path.join(root, "bundled-tokenizer.json");
    try {
      await writeFile(tokenizerPath, tokenizer);
      expect(QWEN_TTS_FILES.every(file => file.url.includes("/41d3337e8b7f2843a75841595fc14e4b9a7a4b96/"))).toBe(true);
      expect(QWEN_TTS_FILES.some(file => file.relativePath === "speech_tokenizer/model.safetensors")).toBe(true);
      expect(await qwenTtsReady(root)).toBe(false);
      const modelDir = await downloadQwenTts({ cacheDir: root, tokenizerPath,
        tokenizerSha256: createHash("sha256").update(tokenizer).digest("hex"),
        files: [{ url: "https://models.invalid/weight", relativePath: "speech_tokenizer/model.safetensors", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
        fetcher: async () => new Response(bytes),
      });
      expect(modelDir).toBe(path.join(root, QWEN_TTS_MODEL_DIR));
      expect(await readFile(path.join(modelDir, "tokenizer.json"))).toEqual(tokenizer);
      expect(await readFile(path.join(modelDir, "speech_tokenizer/model.safetensors"))).toEqual(bytes);
      await expect(downloadQwenTts({ cacheDir: root, tokenizerPath, tokenizerSha256: "0".repeat(64), files: [], fetcher: async () => { throw new Error("다운로드하면 안 됨"); } })).rejects.toThrow(/tokenizer.*SHA-256/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("checks SHA-256 and removes a partial file when a resumed download fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-model-test-"));
    const destination = path.join(root, "model.bin");
    const bytes = Buffer.from("verified model");
    const file = { url: "https://models.invalid/model.bin", sha256: createHash("sha256").update(bytes).digest("hex"), relativePath: "model.bin", size: bytes.length };
    try {
      await downloadModelFile({ file, destination, fetcher: async () => new Response(bytes, { status: 200 }) });
      expect(await readFile(destination)).toEqual(bytes);
      await unlink(destination);
      await writeFile(`${destination}.part`, "partial");
      await expect(downloadModelFile({ file, destination, fetcher: async () => { throw new Error("network failed"); } })).rejects.toThrow("network failed");
      await expect(readFile(`${destination}.part`)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes a temporary file when canceled", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-model-cancel-"));
    const destination = path.join(root, "model.bin");
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(downloadModelFile({ file: { url: "https://models.invalid/model.bin", sha256: "0".repeat(64), relativePath: "model.bin" }, destination, signal: controller.signal })).rejects.toThrow();
      await expect(readFile(`${destination}.part`)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
