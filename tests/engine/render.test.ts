import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import type { RenderShortOptions } from "../../src/engine/pipeline/render";
import { Hono } from "hono";
import { tokenGuard } from "../../src/engine/http";

describe("render route", () => {
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
    const context = { store, jobs, token: "test-token", codexPath: async () => null, jevAvailable: false };
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
