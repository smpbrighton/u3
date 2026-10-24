import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

let root = "";
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});

describe("sidecar library routes", () => {
  it("lists sidecars, filters by search text, and returns tokenized media URLs", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-library-route-"));
    const folder = path.join(root, "library", "memes", "laugh");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "laugh-1.mp4"), "clip");
    await writeFile(path.join(folder, "laugh-1.json"), JSON.stringify({
      id: "laugh-1",
      emotion: "laugh",
      situations: ["funny"],
      importedAt: "2026-09-01T00:00:00.000Z",
      tagsConfirmed: true,
      description: "laughing person",
    }));
    vi.stubEnv("U3_LIBRARY_DIR", path.join(root, "library"));
    const app = createApp({ store: new Store(path.join(root, "store")), jobs: new Jobs(), token: "secret", codexPath: async () => null, jevAvailable: false });

    const response = await app.request("http://127.0.0.1/api/library/memes?q=laugh", { headers: { authorization: "Bearer secret" } });
    const items = await response.json() as { id: string; url: string }[];
    expect(response.status).toBe(200);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("laugh-1");
    expect(items[0]!.url).toContain("token=secret");
  });
});
