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
  it("returns situation-search meme candidates from the non-project library route", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-library-meme-situation-"));
    const folder = path.join(root, "library", "memes", "laugh");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "laugh-1.mp4"), "clip");
    await writeFile(path.join(folder, "laugh-1.json"), JSON.stringify({
      id: "laugh-1", emotion: "laugh", situations: ["친구가 어이없는 말을 했을 때"], importedAt: "2026-09-01T00:00:00.000Z", tagsConfirmed: true, description: "황당한 표정",
    }));
    vi.stubEnv("U3_LIBRARY_DIR", path.join(root, "library"));
    const app = createApp({ store: new Store(path.join(root, "store")), jobs: new Jobs(), token: "secret", codexPath: async () => null, jevAvailable: false });

    const response = await app.request("http://127.0.0.1/api/library/memes/search", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ q: "친구가 어이없는 말을 했을 때" }),
    });
    const result = await response.json() as { items: { id: string }[]; by: string };

    expect(response.status).toBe(200);
    expect(result.items.map(item => item.id)).toContain("laugh-1");
    expect(result.by).toBe("rule");
  });

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

  it("applies optional offset and limit to meme results without wrapping the response", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-library-page-"));
    const folder = path.join(root, "library", "memes", "laugh");
    await mkdir(folder, { recursive: true });
    for (const [index, id] of ["first", "middle", "last"].entries()) {
      await writeFile(path.join(folder, `${id}.mp4`), "clip");
      await writeFile(path.join(folder, `${id}.json`), JSON.stringify({
        id, emotion: "laugh", situations: [], importedAt: `2026-09-0${index + 1}T00:00:00.000Z`, tagsConfirmed: true,
      }));
    }
    vi.stubEnv("U3_LIBRARY_DIR", path.join(root, "library"));
    const app = createApp({ store: new Store(path.join(root, "store")), jobs: new Jobs(), token: "secret", codexPath: async () => null, jevAvailable: false });

    const response = await app.request("http://127.0.0.1/api/library/memes?limit=1&offset=1", { headers: { authorization: "Bearer secret" } });
    const items = await response.json() as { id: string }[];

    expect(response.status).toBe(200);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("middle");
  });
});
