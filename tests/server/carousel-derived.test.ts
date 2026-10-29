import { BUNDLED_PROMPT_DEFAULTS } from "../../src/core/default-prompts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";

const roots: string[] = [];
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function setup(jevEnabled = true, remote = false) {
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
  const derivePlan = vi.fn(async ({ count, prompt }: { count: number; prompt: string }) => {
    expect(prompt).not.toContain("data:image");
    return { caption: "영상 게시 캡션", slides: Array.from({ length: count }, (_, i) => ({ sceneNumber: i + 1, title: `제목 ${i + 1}`, body: `본문 ${i + 1}`, target: "상품" })), usage: {} };
  });
  const app = createApp({ promptDefaults: remote ? async () => ({ ...BUNDLED_PROMPT_DEFAULTS, schema: 1, revision: 2, script: "대본", carouselTopic: "주제", carouselVideo: "원격 영상 지침" }) : undefined, store, jobs, token: "test-token", codexPath: async () => null, jevKey: async () => "fixture-jev-key",
    carouselServices: {
      refine: async () => ({ candidates: [], usage: {} }), plan: async () => ({ style: "", slides: [], usage: {} }), generateImage: async () => Buffer.from([]),
      derivePlan,
      renderFrame: async ({ outputPath }) => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, Buffer.from("png")); },
      askBox,
    },
  });
  return { app, store, jobs, project, askBox, derivePlan };
}

describe("video derived carousel API", () => {
  it.each([undefined, "저장한 영상 기획 지침", "remote"])("영상 기획과 재기획은 기본값 또는 저장한 본문 뒤에 장수와 자료를 붙인다: %s", async saved => {
    const { app, store, project, derivePlan } = await setup(true, saved === "remote");
    await store.saveSettings({ ...await store.readSettings(), carouselVideoPrompt: saved === "remote" ? undefined : saved, scriptPrompt: "섞지 않을 대본 지침", scriptPersona: "섞지 않을 성격" });
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    expect(response.status).toBe(201);
    const { carousel } = await response.json() as { carousel: { id: string } };
    const replanned = await app.request(`/api/carousels/${carousel.id}/plan`, { method: "POST", headers, body: "{}" });
    expect(replanned.status).toBe(202);
    expect(derivePlan).toHaveBeenCalledTimes(2);
    const prefix = `${saved === "remote" ? "원격 영상 지침" : saved ?? DEFAULT_CAROUSEL_VIDEO_PROMPT}\n\n요청 장수: 2\n자료: `;
    for (const [input] of derivePlan.mock.calls) {
      expect(input.prompt.startsWith(prefix)).toBe(true);
      expect(JSON.parse(input.prompt.slice(prefix.length).split("\n\n")[0]!)).toMatchObject({
        scenes: [{ sceneNumber: 1, caption: "상품을 보여 줍니다" }, { sceneNumber: 2, caption: "다음 장면" }],
        captionLayersMain: expect.any(Array), title: "시험 영상", videoDurationSec: expect.any(Number),
      });
      expect(input.prompt).toContain("imagePrompt");
      expect(input.prompt).toContain("style");
    }
  });

  it("accepts all four aspects for frame based carousels", async () => {
    const { app, jobs, project } = await setup();
    for (const aspect of ["9:16", "16:9"] as const) {
      const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2, aspect }) });
      expect(response.status).toBe(201);
      const result = await response.json() as { carousel: { id: string; aspect: string } };
      expect(result.carousel.aspect).toBe(aspect);
      const generation = await app.request(`/api/carousels/${result.carousel.id}/generate`, { method: "POST", headers, body: "{}" });
    const started = await generation.json() as { jobs: Array<{ id: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));
      const saved = await app.request(`/api/carousels/${result.carousel.id}`, { headers });
      expect((await saved.json() as { aspect: string }).aspect).toBe(aspect);
    }
  });

  it("stores the original timeline duration on newly derived carousels", async () => {
    const { app, jobs, project } = await setup();
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    const result = await response.json() as { carousel: { id: string; source: { durationSec?: number } } };
    const generation = await app.request(`/api/carousels/${result.carousel.id}/generate`, { method: "POST", headers, body: "{}" });
    const started = await generation.json() as { jobs: Array<{ id: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));
    const expectedDuration = project.timeline.video.reduce((sum, clip) => sum + ("durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec), 0);

    expect(result.carousel.source.durationSec).toBe(expectedDuration);
  });

  it("plans without frame images, extracts one frame and box per slide, and isolates a re-extract to one slide", async () => {
    const { app, store, jobs, project, askBox } = await setup();
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    expect(response.status).toBe(201);
    const result = await response.json() as { carousel: { id: string; slides: Array<{ id: string }> } };
    // 원본 장면의 동기 재추출 계약은 명시적인 frame 모드에서 유지한다.
    for (const slide of result.carousel.slides) await app.request(`/api/carousels/${result.carousel.id}/slides/${slide.id}`, { method: "PATCH", headers, body: JSON.stringify({ background: { mode: "frame" } }) });
    const generation = await app.request(`/api/carousels/${result.carousel.id}/generate`, { method: "POST", headers, body: "{}" });
    const started = await generation.json() as { jobs: Array<{ id: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));
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
    const result = await response.json() as { carousel: { id: string } };
    const generation = await app.request(`/api/carousels/${result.carousel.id}/generate`, { method: "POST", headers, body: "{}" });
    const started = await generation.json() as { jobs: Array<{ id: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));
    expect(askBox).not.toHaveBeenCalled();
  });

  it("saves the no-highlight choice without requesting a box", async () => {
    const { app, jobs, project, askBox } = await setup();
    const response = await app.request(`/api/projects/${project.id}/carousel`, { method: "POST", headers, body: JSON.stringify({ count: 2 }) });
    const result = await response.json() as { carousel: { id: string; slides: Array<{ id: string }> } };
    const generation = await app.request(`/api/carousels/${result.carousel.id}/generate`, { method: "POST", headers, body: "{}" });
    const started = await generation.json() as { jobs: Array<{ id: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));

    const updated = await app.request(`/api/carousels/${result.carousel.id}/slides/${result.carousel.slides[0]!.id}/highlight`, { method: "POST", headers, body: JSON.stringify({ style: "none", target: "" }) });

    expect(updated.status).toBe(200);
    const saved = await updated.json() as { slides: Array<{ background: { highlight?: { style: string } } }> };
    expect(saved.slides[0]?.background.highlight?.style).toBe("none");
    expect(askBox).toHaveBeenCalledTimes(2);
  });
});
