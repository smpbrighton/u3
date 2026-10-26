import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

async function appAt() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-carousels-api-")); roots.push(root);
  const store = new Store(root); await store.init();
  const jobs = new Jobs();
  const app = createApp({ store, jobs, token: "test-token", codexPath: async () => null, jevAvailable: false,
    carouselServices: {
      refine: async () => ({ candidates: [{ topic: "주제 1", angle: "각도 1" }, { topic: "주제 2", angle: "각도 2" }, { topic: "주제 3", angle: "각도 3" }], usage: {} }),
      plan: async ({ topic, count }: { topic: string; count: number }) => ({ style: "수채화", slides: Array.from({ length: count }, (_, i) => ({ title: `제목 ${i + 1}`, body: `본문 ${i + 1}`, imagePrompt: `이미지 ${i + 1}` })), topic, usage: {} }),
      generateImage: async () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    },
  });
  return { app, store, jobs };
}

describe("carousels API", () => {
  it("saves and validates image options and applies concurrency to the image queue", async () => {
    const { app, store } = await appAt();
    expect(await (await app.request("http://127.0.0.1/api/system/image-options", { headers })).json()).toMatchObject({ model: "flare", quality: "auto", aspect: "4:5", concurrency: 3 });
    const invalid = await app.request("http://127.0.0.1/api/system/image-options", { method: "PUT", headers, body: JSON.stringify({ model: "bad", quality: "low", aspect: "4:5", concurrency: 3 }) });
    expect(invalid.status).toBe(400);
    const saved = await app.request("http://127.0.0.1/api/system/image-options", { method: "PUT", headers, body: JSON.stringify({ model: "sunburst", quality: "high", aspect: "1:1", concurrency: 4 }) });
    expect(saved.status).toBe(200);
    expect(await store.readSettings()).toMatchObject({ imageOptions: { model: "sunburst", quality: "high", aspect: "1:1", concurrency: 4 } });
  });

  it("creates, plans, generates, and cancels carousel image work", async () => {
    const { app, jobs } = await appAt();
    const createdResponse = await app.request("http://127.0.0.1/api/carousels", { method: "POST", headers, body: JSON.stringify({ name: "캐러셀", topic: "바다", slideCount: 2 }) });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string };
    const planned = await app.request(`http://127.0.0.1/api/carousels/${created.id}/plan`, { method: "POST", headers, body: "{}" });
    expect(planned.status).toBe(202);
    const generate = await app.request(`http://127.0.0.1/api/carousels/${created.id}/generate`, { method: "POST", headers, body: "{}" });
    expect(generate.status).toBe(202);
    const { jobs: started } = await generate.json() as { jobs: Array<{ id: string }> };
    expect(started.length).toBeGreaterThan(0);
    const cancel = await app.request(`http://127.0.0.1/api/carousels/${created.id}/cancel`, { method: "POST", headers, body: "{}" });
    expect(cancel.status).toBe(200);
    expect(jobs.list().some(job => job.kind === "image")).toBe(true);
  });

  it("returns three validated topic refinement candidates", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/carousels/refine", { method: "POST", headers, body: JSON.stringify({ topic: "바다" }) });
    expect(response.status).toBe(200);
    expect((await response.json() as { candidates: unknown[] }).candidates).toHaveLength(3);
  });
});
