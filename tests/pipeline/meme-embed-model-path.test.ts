import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const pipeline = vi.fn(async () => async (texts: string[]) => ({ data: new Float32Array(texts.length * 2) }));
const env = { cacheDir: "", localModelPath: "/bundled/node_modules/@huggingface/transformers/models" };
vi.mock("@huggingface/transformers", () => ({ env, pipeline }));

import { bgeM3Embedder } from "../../src/engine/pipeline/meme-embed";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  pipeline.mockClear();
});

describe("bge-m3 local model path", () => {
  it("resolves the downloaded model below the data cache/models directory", async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "u3-bge-model-path-"));
    roots.push(cacheDir);
    await mkdir(path.join(cacheDir, "models--Xenova--bge-m3"), { recursive: true });
    const embedder = bgeM3Embedder({ cacheDir });

    await embedder.embed(["웃긴 장면"]);

    expect(env.cacheDir).toBe(cacheDir);
    expect(env.localModelPath).toBe(cacheDir);
  });
});
