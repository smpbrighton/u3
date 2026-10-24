import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../src/core/schema";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { bgeM3Embedder, memeIndex } from "../../src/engine/pipeline/meme-embed";
import { BGE_FILES } from "../../src/engine/pipeline/models";
import { Store } from "../../src/engine/store";

const fixtureRoot = path.resolve("tests/fixtures/project");
const token = "meme-rank-fallback-token";

describe("meme rank without a local model", () => {
  it.each(["empty cache", "partial ONNX cache"]) ("returns rule ranking and serves another request with %s", async cacheKind => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-meme-rank-fallback-"));
    const store = new Store(root);
    const library = path.join(root, "library");
    const embedder = bgeM3Embedder({ cacheDir: path.join(root, "cache/models"), requireReady: true });
    vi.stubEnv("U3_LIBRARY_DIR", library);
    const memeDir = path.join(library, "memes", "laugh");
    const project = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
    const app = createApp({
      store,
      jobs: new Jobs(),
      token,
      codexPath: async () => null,
      jevAvailable: false,
      memeIndex: memeIndex(root, embedder),
    });
    try {
      await store.init();
      await store.saveProject(project);
      await mkdir(memeDir, { recursive: true });
      await writeFile(path.join(memeDir, "laugh.json"), JSON.stringify({
        id: "laugh",
        emotion: "laugh",
        description: "웃긴 장면",
        situations: ["funny"],
        importedAt: "2026-01-01T00:00:00.000Z",
        tagsConfirmed: true,
      }));
      await writeFile(path.join(memeDir, "laugh.mp4"), "");

      if (cacheKind === "partial ONNX cache") {
        const modelRoot = path.join(root, "cache/models");
        const modelDir = path.join(modelRoot, "Xenova/bge-m3/onnx");
        await mkdir(path.join(modelRoot, "models--Xenova--bge-m3"), { recursive: true });
        await mkdir(modelDir, { recursive: true });
        const onnx = BGE_FILES.find(file => file.relativePath === "onnx/model.onnx")!;
        const onnxPath = path.join(modelDir, "model.onnx");
        await writeFile(onnxPath, "");
        await truncate(onnxPath, onnx.size);
      }

      const response = await app.request(`/api/projects/${project.id}/memes/rank`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ caption: "웃긴 장면", query: "funny" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        by: "rule",
        list: [{ meme: { id: "laugh" } }],
        search: { rule: [{ id: "laugh" }], embedError: expect.any(String) },
      });
      expect(embedder.status()).toBe("idle");

      const health = await app.request("/api/health", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
