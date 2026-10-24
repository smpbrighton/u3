import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function appAt() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-basics-"));
  roots.push(root);
  return createApp({
    store: new Store(root),
    jobs: new Jobs(),
    token: "one-time-token",
    tauriOrigin: "tauri://localhost",
    codexPath: async () => null,
    jevAvailable: false,
  });
}

describe("sidecar basics", () => {
  it("returns health status after the local route gates pass", async () => {
    const app = await appAt();
    const response = await app.request("http://127.0.0.1/api/health", {
      headers: { authorization: "Bearer one-time-token", origin: "tauri://localhost" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns JSON 404 for an unknown API path", async () => {
    const app = await appAt();
    const response = await app.request("http://127.0.0.1/api/unknown", {
      headers: { authorization: "Bearer one-time-token" },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not-found" } });
  });

  it("creates a project with the storage folders and reads it back", async () => {
    const app = await appAt();
    const created = await app.request("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: { authorization: "Bearer one-time-token", "content-type": "application/json" },
      body: JSON.stringify({ name: "테스트 프로젝트" }),
    });
    const project = await created.json() as { id: string; name: string };
    expect(created.status).toBe(201);
    expect(project.name).toBe("테스트 프로젝트");
    expect(await app.request(`http://127.0.0.1/api/projects/${project.id}`, {
      headers: { authorization: "Bearer one-time-token" },
    })).toHaveProperty("status", 200);
  });

  it("returns a JSON error for a malformed JSON body", async () => {
    const response = await (await appAt()).request("http://127.0.0.1/api/projects", {
      method: "POST",
      headers: { authorization: "Bearer one-time-token", "content-type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "bad-json" } });
  });
});
