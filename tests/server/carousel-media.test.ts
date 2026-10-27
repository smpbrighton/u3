import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import type { MediaServer } from "../../src/engine/pipeline/media-server";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

describe("carousel media route", () => {
  it("redirects a query-token image request to the media server", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-carousel-media-")); roots.push(root);
    const store = new Store(root); await store.init();
    const mediaServer = { origin: "http://127.0.0.1:9", url: (prefix: string, rel: string) => `http://127.0.0.1:9/${prefix}/${rel}?token=test-token`, close: async () => undefined } as unknown as MediaServer;
    const app = createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null, mediaServer });
    const created = await (await app.request("http://127.0.0.1/api/carousels", { method: "POST", headers, body: JSON.stringify({ name: "캐러셀", topic: "바다", slideCount: 2 }) })).json() as { id: string };

    const response = await app.request(`http://127.0.0.1/api/media/carousels/${created.id}/images/slide-1.png?token=test-token`);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`http://127.0.0.1:9/carousels/${created.id}/images/slide-1.png?token=test-token`);
  });
});
