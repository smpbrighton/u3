import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { downloadModelFile } from "../../src/engine/pipeline/models";

describe("model downloader", () => {
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
