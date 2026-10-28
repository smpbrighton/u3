import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { CarouselStore } from "../../src/engine/carousel-store";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_BRAND_SETTINGS } from "../../src/core/schema";
import type { Carousel } from "../../src/core/carousel";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-workflow-")); roots.push(root);
  const store = new Store(root); await store.init();
  const jobs = new Jobs(); const carousels = new CarouselStore(root, id => jobs.hasActiveForProject(id));
  const plan = vi.fn(async ({ count }: { count: number; topic: string; style?: string }) => ({
    caption: "게시 캡션 🌊", style: "수채화", slides: Array.from({ length: count }, (_, i) => ({ title: `제목 ${i}`, body: `본문 ${i}`, imagePrompt: `배경 ${i}` })), usage: {},
  }));
  const derivePlan = vi.fn(async ({ count }: { count: number; prompt: string; projectId: string }) => ({
    caption: "영상 캡션", slides: Array.from({ length: count }, (_, i) => ({ sceneNumber: i % 2 + 1, title: `영상 ${i}`, body: "설명", target: "상품" })), usage: {},
  }));
  const generateImage = vi.fn(async () => Buffer.from("png"));
  const renderFrame = vi.fn(async ({ outputPath }: { outputPath: string }) => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, "png"); });
  const askBox = vi.fn(async () => ({ box: { left: 0.1, top: 0.1, right: 0.7, bottom: 0.8 }, confidence: 0.9, usage: { input_tokens: 1, output_tokens: 1 }, model: "jev-1.14.0" }));
  const app = createApp({ store, jobs, carouselStore: carousels, token: "test-token", codexPath: async () => null, jevKey: async () => "key",
    carouselServices: { refine: async () => ({ candidates: [], usage: {} }), plan, derivePlan, generateImage, renderFrame, askBox },
    composeCarouselSlide: async (_c, _s, output) => { await writeFile(output, "composed"); },
  });
  const req = (url: string, method = "GET", body?: unknown) => app.request(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function topic() { return await (await req("/api/carousels", "POST", { topic: "바다", slideCount: 2, aspect: "1:1", style: "사진" })).json() as Carousel; }
  async function project() {
    const fixture = JSON.parse(await readFile("tests/fixtures/project/project.json", "utf8"));
    const p = await store.saveProject(fixture);
    await writeFile(path.join(store.projectDir(p.id), "script.json"), JSON.stringify({ title: "영상", scenes: [1, 2].map(i => ({
      caption: `장면 ${i}`, inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: i - 1, endSec: i,
    })) }));
    return p;
  }
  async function derived() {
    const p = await project();
    const response = await req(`/api/projects/${p.id}/carousel`, "POST", { count: 2 });
    expect(response.status).toBe(201);
    const result = await response.json() as { carousel: Carousel; job?: unknown };
    expect(result.job).toBeUndefined();
    return { p, c: result.carousel };
  }
  async function generate(id: string) {
    const response = await req(`/api/carousels/${id}/generate`, "POST", {});
    expect(response.status).toBe(202);
    const started = await response.json() as { jobs: Array<{ id: string; key: string }> };
    await Promise.all(started.jobs.map(job => jobs.wait(job.id)));
    expect(started.jobs.map(job => jobs.get(job.id)?.status)).toEqual(started.jobs.map(() => "done"));
    return started.jobs;
  }
  return { root, store, jobs, carousels, req, topic, derived, project, generate, plan, derivePlan, generateImage, renderFrame, askBox };
}

describe("carousel review workflow", () => {
  it("creates review without work, plans a caption, and generates the edited prompt and text", async () => {
    const { req, topic, jobs, plan, generate, generateImage } = await setup();
    const c = await topic();
    expect(c).toMatchObject({ stage: "review", aspect: "1:1", style: "사진" }); expect(jobs.list()).toEqual([]);
    const planned = await (await req(`/api/carousels/${c.id}/plan`, "POST", {})).json() as Carousel;
    expect(plan).toHaveBeenCalledWith({ topic: "바다", count: 2, style: "사진" });
    expect(planned.caption).toBe("게시 캡션 🌊"); expect(jobs.list()).toEqual([]);
    const texts = planned.slides[0]!.texts.map(t => ({ ...t, text: t.role === "title" ? "검토한 제목" : "검토한 본문" }));
    expect((await req(`/api/carousels/${c.id}/slides/slide-1`, "PATCH", { texts, imagePrompt: "수정한 배경", brightness: 1.2, shade: 0.5 })).status).toBe(200);
    expect((await req(`/api/carousels/${c.id}`, "PATCH", { caption: "고친 캡션", style: "유화" })).status).toBe(200);
    const added = await (await req(`/api/carousels/${c.id}/slides`, "POST", {})).json() as Carousel;
    const ids = added.slides.map(s => s.id);
    expect((await req(`/api/carousels/${c.id}/slides/order`, "PUT", { slideIds: [...ids].reverse() })).status).toBe(200);
    expect((await req(`/api/carousels/${c.id}/slides/${ids[2]}`, "DELETE")).status).toBe(200);
    const started = await generate(c.id); expect(started).toHaveLength(2);
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "수정한 배경", style: "유화" }));
    const saved = await (await req(`/api/carousels/${c.id}`)).json() as Carousel;
    expect(saved).toMatchObject({ stage: "images", caption: "고친 캡션" });
    expect(saved.slides.find(s => s.id === "slide-1")!.texts).toEqual(texts);
    for (const [method, suffix, body] of [["POST", "/slides", {}], ["DELETE", "/slides/slide-1", undefined], ["PUT", "/slides/order", { slideIds: ["slide-1", "slide-2"] }]] as const) {
      expect((await req(`/api/carousels/${c.id}${suffix}`, method, body)).status).toBe(409);
    }
    expect((await req(`/api/carousels/${c.id}`, "PATCH", { stage: "review" })).status).toBe(400);
    expect((await req(`/api/carousels/${c.id}/slides/slide-1`, "PATCH", { title: "옛 입력" })).status).toBe(400);
  });
  it("skips empty prompts with an explicit error and writes a UTF-8 caption beside PNGs", async () => {
    const { req, topic, generate, root } = await setup(); const c = await topic();
    await req(`/api/carousels/${c.id}/slides/slide-1`, "PATCH", { imagePrompt: "배경" });
    await req(`/api/carousels/${c.id}`, "PATCH", { caption: "캡션 🌊\n둘째 줄" });
    expect(await generate(c.id)).toHaveLength(1);
    const saved = await (await req(`/api/carousels/${c.id}`)).json() as Carousel;
    expect(saved.slides[1]).toMatchObject({ status: "failed", error: "지시문 없음" });
    const downloaded = await (await req(`/api/carousels/${c.id}/download`, "POST", { dir: path.join(root, "받기") })).json() as { directory: string; files: string[] };
    expect(downloaded.files).toEqual(["01.png", "caption.txt"]);
    expect(await readFile(path.join(downloaded.directory, "caption.txt"), "utf8")).toBe("캡션 🌊\n둘째 줄");
  });
  it("plans project slides without work and generates a frame job and Jev box per slide", async () => {
    const { req, derived, jobs, generate, renderFrame, askBox, derivePlan } = await setup();
    const { c } = await derived();
    expect(c).toMatchObject({ stage: "review", caption: "영상 캡션" }); expect(jobs.list()).toEqual([]);
    expect(renderFrame).not.toHaveBeenCalled(); expect(askBox).not.toHaveBeenCalled();
    const added = await (await req(`/api/carousels/${c.id}/slides`, "POST", {})).json() as Carousel;
    expect(added.slides[2]).toMatchObject({ sceneNumber: 2, background: { kind: "frame", sec: 2.8, highlight: { style: "none", target: "" } } });
    await req(`/api/carousels/${c.id}/slides/${added.slides[2]!.id}`, "DELETE");
    expect((await req(`/api/carousels/${c.id}/plan`, "POST", {})).status).toBe(202);
    expect(derivePlan).toHaveBeenCalledTimes(2); expect(jobs.list()).toEqual([]);
    await req(`/api/carousels/${c.id}/slides/slide-1`, "PATCH", { sceneNumber: 2, background: { sec: 1.8 } });
    const started = await generate(c.id);
    expect(started.map(job => job.key)).toEqual(c.slides.map(s => `carousel:${c.id}:${s.id}`));
    expect(renderFrame).toHaveBeenCalledTimes(2); expect(askBox).toHaveBeenCalledTimes(2);
    expect(renderFrame).toHaveBeenCalledWith(expect.objectContaining({ sec: 1.8 }));
    const saved = await (await req(`/api/carousels/${c.id}`)).json() as Carousel;
    expect(saved.slides.every(s => s.background.kind === "frame" && s.background.status === "done" && s.background.highlight?.box)).toBe(true);
  });
  it("cancels by the slide id in the job key even when sceneIndex points elsewhere", async () => {
    const { req, derived, jobs, carousels } = await setup(); const { c } = await derived();
    const job = jobs.startImage({ projectId: c.id, sceneIndex: 1, key: `carousel:${c.id}:slide-1`, label: "대기", cancellable: true }, async ctx => {
      await new Promise((_, reject) => { if (ctx.signal.aborted) reject(new Error("취소")); else ctx.signal.addEventListener("abort", () => reject(new Error("취소")), { once: true }); });
      return { kind: "done" };
    }, jobs.queue);
    await carousels.updateSlideEngineFields(c.id, "slide-1", { background: { status: "running" } });
    expect((await req(`/api/carousels/${c.id}/cancel`, "POST", {})).status).toBe(200);
    await jobs.wait(job.id);
    const saved = await (await req(`/api/carousels/${c.id}`)).json() as Carousel;
    expect(saved.slides[0]!.background).toMatchObject({ status: "failed", error: "취소했습니다" });
    expect(saved.slides[1]!.background).toMatchObject({ status: "idle" });
  });
  it("copies the configured watermark and serves each image format with its content type", async () => {
    const { req, topic, root, store } = await setup(); const c = await topic();
    expect((await req(`/api/carousels/${c.id}/logo`, "POST", {})).status).toBe(409);
    for (const [ext, mime] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      await mkdir(path.join(root, "brand"), { recursive: true }); const file = `watermark.${ext}`;
      await writeFile(path.join(root, "brand", file), "원본");
      await store.saveSettings({ brand: { ...DEFAULT_BRAND_SETTINGS, watermark: { x: 0.4, y: 0.1, width: 0.3, opacity: 0.6, file } } });
      const response = await req(`/api/carousels/${c.id}/logo`, "POST", {});
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ enabled: true, file: `logos/logo.${ext}`, x: 0.4, y: 0.1, width: 0.3, opacity: 0.6 });
      await rm(path.join(root, "brand", file));
      const image = await req(`/api/carousels/${c.id}/files/logos/logo.${ext}`);
      expect(image.headers.get("content-type")).toBe(mime); expect(await image.text()).toBe("원본");
    }
  });
  it("lists only existing script frames with their times and does not extract", async () => {
    const { req, project, store, renderFrame } = await setup(); const p = await project();
    expect(await (await req(`/api/projects/${p.id}/frames/list`)).json()).toEqual([]);
    const input = p.inputs[0]!; const dir = path.join(store.projectDir(p.id), "input", ".frames", input.id);
    await mkdir(dir, { recursive: true });
    for (const name of ["frame-02.jpg", "frame-01.jpg", "notes.txt"]) await writeFile(path.join(dir, name), "frame");
    const result = await (await req(`/api/projects/${p.id}/frames/list`)).json() as Array<{ inputId: string; frames: Array<{ sec: number; url: string }> }>;
    expect(result[0]!.inputId).toBe(input.id);
    expect(result[0]!.frames.map(f => f.sec)).toEqual([input.durationSec! / 4, input.durationSec! * 3 / 4]);
    expect(result[0]!.frames[0]!.url).toContain("token=");
    expect(renderFrame).not.toHaveBeenCalled();
  });
});
