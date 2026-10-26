import { afterEach, describe, expect, it, vi } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function setup(jevEnabled = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-derived-carousel-")); roots.push(root);
  const store = new Store(root); await store.init();
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/project/project.json"), "utf8"));
  const projectDir = store.projectDir(fixture.id); await mkdir(path.join(projectDir, "input"), { recursive: true });
  await cp(path.join(process.cwd(), "tests/fixtures/project/input/video.mp4"), path.join(projectDir, "input/video.mp4"));
  const project = await store.saveProject(fixture);
  await writeFile(path.join(projectDir, "script.json"), JSON.stringify({ title: "시험 영상", scenes: [
    { caption: "상품을 보여 줍니다", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 0, endSec: 1 },
    { caption: "다음 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 2, endSec: 3 },
  ] }));
  await store.saveSettings({ jevEnabled });
  const jobs = new Jobs(); const askBox = vi.fn(async () => ({ box: { left: 0.1, top: 0.1, right: 0.7, bottom: 0.8 }, confidence: 0.9, usage: { input_tokens: 2, output_tokens: 1 }, model: "jev-1.14.0" }));
  const app = createApp({ store, jobs, token: "test-token", codexPath: async () => null, jevAvailable: true,
    carouselServices: {
      refine: async () => ({ candidates: [], usage: {} }), plan: async () => ({ style: "", slides: [], usage: {} }), generateImage: async () => Buffer.from([]),
      derivePlan: async ({ count, prompt }) => {
        expect(prompt).not.toContain("data:image");
        return { slides: Array.from({ length: count }, (_, i) => ({ sceneNumber: i + 1, title: `제목 ${i + 1}`, body: `본문 ${i + 1}`, target: "상품" })), usage: {} };
      },
      renderFrame: async ({ outputPath }) => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, Buffer.from("png")); },
      askBox,
    },
  });
  return { app, store, jobs, project, askBox };
}

describe("video derived carousel API", () => {
  it("accepts all four aspects for frame based carousels", async () => {
    const { app, jobs, project } = await setup();
    for (const aspect of ["9:16", "16:9"] as const) {
      const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2, aspect }) });
      expect(response.status).toBe(202);
      const result = await response.json() as { carousel: { id: string; aspect: string }; job: { id: string } };
      expect(result.carousel.aspect).toBe(aspect);
      await jobs.wait(result.job.id);
      const saved = await app.request(`/api/carousels/${result.carousel.id}`, { headers });
      expect((await saved.json() as { aspect: string }).aspect).toBe(aspect);
    }
  });

  it("plans without frame images, extracts one frame and box per slide, and isolates a re-extract to one slide", async () => {
    const { app, store, jobs, project, askBox } = await setup();
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    expect(response.status).toBe(202);
    const result = await response.json() as { carousel: { id: string; slides: Array<{ id: string }> }; job: { id: string } };
    await jobs.wait(result.job.id);
    const carouselResponse = await app.request(`/api/carousels/${result.carousel.id}`, { headers });
    const carousel = await carouselResponse.json() as { slides: Array<{ id: string; background: { frame: { file: string }; highlight: { box: unknown } } }> };
    expect(carousel.slides).toHaveLength(2);
    expect(carousel.slides.every(slide => slide.background.frame.file && slide.background.highlight.box)).toBe(true);
    expect(askBox).toHaveBeenCalledTimes(2);
    const secondBefore = carousel.slides[1]!.background;
    const reextract = await app.request(`/api/carousels/${result.carousel.id}/slides/${carousel.slides[0]!.id}/frame`, { method: "POST", headers, body: JSON.stringify({ sec: 2.5, cropY: 0.3 }) });
    expect(reextract.status).toBe(200);
    const next = await reextract.json() as typeof carousel;
    expect(next.slides[0]!.background.frame.file).not.toBe(carousel.slides[0]!.background.frame.file);
    expect(next.slides[1]!.background).toEqual(secondBefore);
    await store.deleteProject(project.id);
    expect((await app.request(`/api/carousels/${result.carousel.id}`, { headers })).status).toBe(200);
    const rejected = await app.request(`/api/carousels/${result.carousel.id}/slides/${carousel.slides[0]!.id}/frame`, { method: "POST", headers, body: JSON.stringify({ sec: 1, cropY: 0.5 }) });
    expect(rejected.status).toBe(409);
  });

  it("does not request Jev when its setting is disabled", async () => {
    const { app, jobs, project, askBox } = await setup(false);
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    const result = await response.json() as { carousel: { id: string }; job: { id: string } };
    await jobs.wait(result.job.id);
    expect(askBox).not.toHaveBeenCalled();
  });
});
