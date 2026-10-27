import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import type { RenderShortOptions } from "../../src/engine/pipeline/render";
import { Hono } from "hono";
import { tokenGuard } from "../../src/engine/http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { resolveMemeFiles } from "../../src/engine/pipeline/render";

describe("render route", () => {
  it("짤 ID를 감정 폴더의 실제 라이브러리 파일로 푼다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-render-meme-id-"));
    const folder = path.join(root, "library", "memes", "놀람");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "tenor-Q3oksRY9moQ.mp4"), "video");
    await writeFile(path.join(folder, "tenor-Q3oksRY9moQ.json"), JSON.stringify({ id: "tenor-Q3oksRY9moQ", emotion: "놀람", situations: [], importedAt: "", tagsConfirmed: true }));
    try {
      await expect(resolveMemeFiles(["tenor-Q3oksRY9moQ"], path.join(root, "library"))).resolves.toEqual({
        "tenor-Q3oksRY9moQ": path.join(folder, "tenor-Q3oksRY9moQ.mp4"),
      });
      await expect(resolveMemeFiles(["missing-meme"], path.join(root, "library"))).rejects.toThrow("짤을 라이브러리에서 찾을 수 없습니다: missing-meme");
    } finally {
      await import("node:fs/promises").then(fs => fs.rm(root, { recursive: true, force: true }));
    }
  });

  it("cancels an active render job", async () => {
    const root = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "u3-render-route-")));
    const store = new Store(root);
    await store.init();
    await store.saveProject(JSON.parse(await readFile("tests/fixtures/project/project.json", "utf8")));
    const jobs = new Jobs();
    let aborted = false;
    const app = new Hono();
    app.use("/api/*", tokenGuard("test-token"));
    const { registerRenderRoutes } = await import("../../src/engine/routes/render");
    const { registerEventRoutes } = await import("../../src/engine/routes/events");
    const context = { store, jobs, token: "test-token", codexPath: async () => null, jevKey: async () => null };
    registerEventRoutes(app, context);
    registerRenderRoutes(app, context, async (options: RenderShortOptions) => new Promise(resolve => {
      options.signal?.addEventListener("abort", () => { aborted = true; resolve(undefined as never); }, { once: true });
    }));
    try {
      const response = await app.request("/api/projects/w5-smoke/render", {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: JSON.stringify({ outputPath: "/tmp/u3-cancel.mp4" }),
      });
      expect(response.status).toBe(202);
      const job = await response.json() as { id: string };
      const canceled = await app.request(`/api/jobs/${job.id}`, { method: "DELETE", headers: { authorization: "Bearer test-token" } });
      expect(canceled.status).toBe(200);
      expect(aborted).toBe(true);
      expect(jobs.get(job.id)?.status).toBe("discarded");
    } finally {
      await import("node:fs/promises").then(fs => fs.rm(root, { recursive: true, force: true }));
    }
  });
});
