import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { onError, tokenGuard } from "../../src/engine/http";
import { registerOutputRoutes } from "../../src/engine/routes/output";

describe("output exists route", () => {
  it("requires the engine token and checks an absolute mp4 file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "u3-output-exists-"));
    const file = path.join(directory, "existing.mp4");
    await writeFile(file, "video");
    const app = new Hono();
    app.onError(onError);
    app.use("/api/*", tokenGuard("test-token"));
    registerOutputRoutes(app);

    try {
      const unauthorized = await app.request(`/api/output-exists?path=${encodeURIComponent(file)}`);
      expect(unauthorized.status).toBe(401);
      const existing = await app.request(`/api/output-exists?path=${encodeURIComponent(file)}`, { headers: { authorization: "Bearer test-token" } });
      expect(existing.status).toBe(200);
      await expect(existing.json()).resolves.toEqual({ exists: true });
      const missing = await app.request(`/api/output-exists?path=${encodeURIComponent(path.join(directory, "missing.mp4"))}`, { headers: { authorization: "Bearer test-token" } });
      await expect(missing.json()).resolves.toEqual({ exists: false });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects relative paths and non-mp4 paths", async () => {
    const app = new Hono();
    app.onError(onError);
    app.use("/api/*", tokenGuard("test-token"));
    registerOutputRoutes(app);
    const headers = { authorization: "Bearer test-token" };

    expect((await app.request("/api/output-exists?path=relative.mp4", { headers })).status).toBe(400);
    expect((await app.request(`/api/output-exists?path=${encodeURIComponent("/tmp/video.mov")}`, { headers })).status).toBe(400);
  });
});
