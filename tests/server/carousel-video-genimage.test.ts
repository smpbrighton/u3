import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp, type AppContext } from "../../src/engine/app";
import { CarouselStore } from "../../src/engine/carousel-store";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { visibleBackground, type Carousel } from "../../src/core/carousel";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-060-")); roots.push(root);
  const store = new Store(root); await store.init();
  const jobs = new Jobs(); const carousels = new CarouselStore(root, id => jobs.hasActiveForProject(id));
  const generateImage = vi.fn<NonNullable<AppContext["carouselServices"]>["generateImage"]>(async () => Buffer.from("generated"));
  const renderFrame = vi.fn(async ({ outputPath }: { outputPath: string }) => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, "frame"); });
  const askBox = vi.fn(async () => ({ box: { left: 0.1, top: 0.1, right: 0.8, bottom: 0.8 }, confidence: 0.9, usage: { input_tokens: 1, output_tokens: 1 }, model: "jev-1.14.0" }));
  const derivePlan = vi.fn(async () => ({ caption: "캡션", style: "공통 사진", slides: [1, 2].map(sceneNumber => ({ sceneNumber, title: `제목 ${sceneNumber}`, body: "본문", target: "상품", imagePrompt: sceneNumber === 1 ? "상품을 선반에" : "" })), usage: {} }));
  const composed = vi.fn(async (_carousel: Carousel, _slide: Carousel["slides"][number], output: string) => { await writeFile(output, "composed"); });
  const app = createApp({ store, jobs, carouselStore: carousels, token: "test", codexPath: async () => null, jevKey: async () => "test-key",
    carouselServices: { refine: async () => ({ candidates: [], usage: {} }), plan: async () => ({ slides: [], usage: {} }), derivePlan, generateImage, renderFrame, askBox }, composeCarouselSlide: composed });
  const req = (url: string, method = "GET", body?: unknown) => app.request(url, { method, headers: { authorization: "Bearer test", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const fixture = JSON.parse(await readFile("tests/fixtures/project/project.json", "utf8"));
  const project = await store.saveProject(fixture);
  await writeFile(path.join(store.projectDir(project.id), "script.json"), JSON.stringify({ title: "영상", scenes: [1, 2].map(i => ({ caption: `상품 ${i}`, inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: i - 1, endSec: i })) }));
  const response = await req(`/api/projects/${project.id}/carousel`, "POST", { count: 2 });
  expect(response.status).toBe(201);
  const { carousel: c } = await response.json() as { carousel: Carousel };
  const base = `/api/carousels/${c.id}`;
  async function wait(response: Response) {
    expect(response.status).toBe(202);
    const value = await response.json() as { jobs?: Array<{ id: string }>; job?: { id: string } };
    const started = value.jobs ?? (value.job ? [value.job] : []);
    expect(started.length).toBeGreaterThan(0);
    await Promise.all(started.map(job => jobs.wait(job.id)));
    return started.map(job => jobs.get(job.id));
  }
  const get = async () => await (await req(base)).json() as Carousel;
  return { root, store, jobs, carousels, c, base, req, wait, get, generateImage, renderFrame, askBox, derivePlan, composed };
}
describe("060 영상 참고 이미지 생성", () => {
  it("기획·추가·재기획은 AI로 시작하고 검토 모드 전환은 생성하지 않는다", async () => {
    const { c, base, req, generateImage, renderFrame, jobs } = await setup();
    expect(c.style).toBe("공통 사진");
    expect(c.slides[0]).toMatchObject({ imagePrompt: "상품을 선반에", background: { mode: "ai" } });
    expect((await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } })).status).toBe(200);
    expect((await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "ai" } })).status).toBe(200);
    const added = await (await req(`${base}/slides`, "POST", {})).json() as Carousel;
    expect(added.slides[2]!.background).toMatchObject({ mode: "ai" });
    await req(`${base}/slides/${added.slides[2]!.id}`, "DELETE");
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    const replanned = await (await req(`${base}/plan`, "POST", {})).json() as Carousel;
    expect(replanned.slides.every(s => s.background.kind === "frame" && s.background.mode === "ai")).toBe(true);
    expect(generateImage).not.toHaveBeenCalled(); expect(renderFrame).not.toHaveBeenCalled(); expect(jobs.list()).toEqual([]);
  });
  it("프레임을 첨부해 생성하고 생성 이미지에서만 상자를 찾으며 빈 지시문을 채운다", async () => {
    const { base, req, wait, get, carousels, c, generateImage, renderFrame, askBox } = await setup();
    await wait(await req(`${base}/generate`, "POST", {}));
    const saved = await get();
    expect(renderFrame).toHaveBeenCalledTimes(2); expect(generateImage).toHaveBeenCalledTimes(2); expect(askBox).toHaveBeenCalledTimes(2);
    for (const slide of saved.slides) {
      if (slide.background.kind !== "frame") throw new Error("frame 필요");
      expect(slide.background).toMatchObject({ status: "done", generatedStatus: "done", generated: { version: 1, frameVersion: 1 } });
      const file = path.join(carousels.carouselDir(c.id), slide.background.frame!.file);
      const call = generateImage.mock.calls.find(([input]) => input.referenceImage === file)!;
      expect(call).toBeDefined(); expect(call[0].style).toBe("공통 사진");
      expect(renderFrame.mock.invocationCallOrder[0]).toBeLessThan(generateImage.mock.invocationCallOrder[0]!);
      expect(askBox).toHaveBeenCalledWith(expect.objectContaining({ imagePath: path.join(carousels.carouselDir(c.id), slide.background.generated!.file) }));
      expect(visibleBackground(slide).file).toBe(slide.background.generated!.file);
    }
    expect(generateImage.mock.calls[0]![0].prompt).toBe("상품을 선반에");
    const fallback = generateImage.mock.calls.find(([input]) => input.prompt.includes("제목 2"))![0].prompt;
    expect(fallback).toContain("본문"); expect(fallback).toContain("상품");
  });
  it("원본 모드는 생성하지 않고 AI 전환은 유효한 생성 파일을 재사용한다", async () => {
    const { base, req, wait, get, generateImage, renderFrame } = await setup();
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    await wait(await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] }));
    expect(generateImage).not.toHaveBeenCalled(); expect(renderFrame).toHaveBeenCalledTimes(1);
    await wait(await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "ai" } }));
    expect(generateImage).toHaveBeenCalledTimes(1); expect(renderFrame).toHaveBeenCalledTimes(1);
    const file = visibleBackground((await get()).slides[0]!).file;
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    expect((await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "ai" } })).status).toBe(200);
    expect(visibleBackground((await get()).slides[0]!).file).toBe(file); expect(generateImage).toHaveBeenCalledTimes(1);
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    expect((await req(`${base}/slides/slide-1/frame`, "POST", { sec: 1.3, cropY: 0.2 })).status).toBe(200);
    await wait(await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "ai" } }));
    expect(generateImage).toHaveBeenCalledTimes(2);
  });
  it("다시 만들기는 프레임을 유지하고 시각 변경은 새 프레임과 생성 작업을 만든다", async () => {
    const { c, base, req, wait, get, renderFrame, generateImage, carousels, askBox } = await setup();
    await wait(await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] }));
    const old = (await get()).slides[0]!;
    await carousels.saveHighlightImageVersion(c.id, "slide-1", Buffer.from("outline"));
    await req(`${base}/slides/slide-1`, "PATCH", { background: { highlight: { box: { left: 0.2, top: 0.2, right: 0.4, bottom: 0.4 } } } });
    await wait(await req(`${base}/slides/slide-1/regenerate`, "POST", {}));
    expect(renderFrame).toHaveBeenCalledTimes(1); expect(generateImage).toHaveBeenCalledTimes(2);
    const fresh = (await get()).slides[0]!;
    expect(fresh.background).toMatchObject({ generated: { version: 2, frameVersion: 1 }, highlight: { style: "ai-outline", target: "상품" } });
    if (fresh.background.kind !== "frame" || old.background.kind !== "frame") throw new Error("frame 필요");
    expect(fresh.background.highlight?.boxManual).toBeUndefined(); expect(fresh.background.highlight?.image).toBeUndefined();
    expect(await readdir(path.join(carousels.carouselDir(c.id), "images"))).toEqual(["slide-1-gen-2.png"]);
    expect(fresh.background.frame).toEqual(old.background.frame);
    await wait(await req(`${base}/slides/slide-1/frame`, "POST", { sec: 1.5, cropY: 0.2 }));
    expect(renderFrame).toHaveBeenCalledTimes(2); expect(generateImage).toHaveBeenCalledTimes(3);
    expect((await get()).slides[0]!.background).toMatchObject({ generated: { frameVersion: 2 } });
    expect(askBox).toHaveBeenCalledTimes(3);
  });
  it("모드 전환은 수동 상자와 윤곽을 지우고 새 배경에서 상자를 찾는다", async () => {
    const { c, base, req, wait, get, carousels, askBox } = await setup();
    await wait(await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] }));
    await carousels.saveHighlightImageVersion(c.id, "slide-1", Buffer.from("outline"));
    await req(`${base}/slides/slide-1`, "PATCH", { background: { highlight: { box: { left: 0.2, top: 0.2, right: 0.4, bottom: 0.4 } } } });
    const response = await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    expect(response.status).toBe(200);
    const background = (await get()).slides[0]!.background;
    if (background.kind !== "frame") throw new Error("frame 필요");
    expect(background.highlight).toMatchObject({ style: "ai-outline", target: "상품", box: { left: 0.1 } });
    expect(background.highlight?.boxManual).toBeUndefined(); expect(background.highlight?.image).toBeUndefined();
    expect(visibleBackground((await get()).slides[0]!).file).toBe(background.frame!.file);
    expect(askBox).toHaveBeenLastCalledWith(expect.objectContaining({ imagePath: path.join(carousels.carouselDir(c.id), background.frame!.file) }));
  });
  it("생성 실패는 한 장에 남고 받기는 생성 완료 장만 고르며 원본으로 복구한다", async () => {
    const { root, base, req, wait, get, generateImage, composed } = await setup();
    generateImage.mockRejectedValueOnce(new Error("시험 생성 실패"));
    await wait(await req(`${base}/generate`, "POST", {}));
    const saved = await get();
    expect(saved.slides[0]!.background).toMatchObject({ status: "done", generatedStatus: "failed", generatedError: "시험 생성 실패" });
    expect(visibleBackground(saved.slides[0]!).file).toBeUndefined();
    expect((await req(`${base}/download`, "POST", { dir: path.join(root, "receive") })).status).toBe(200);
    expect(composed.mock.calls.map(call => call[1].id)).toEqual(["slide-2"]);
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    expect(visibleBackground((await get()).slides[0]!)).toMatchObject({ status: "done", file: expect.stringContaining("frames/") });
  });
  it("취소와 앱 재시작 복구는 AI 생성 상태를 실패로 바꾼다", async () => {
    const { root, c, base, req, wait, get, generateImage, carousels } = await setup();
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    generateImage.mockImplementationOnce(async ({ signal }) => { entered(); return new Promise((_, reject) => { if (signal?.aborted) reject(new Error("취소")); else signal?.addEventListener("abort", () => reject(new Error("취소")), { once: true }); }); });
    const response = await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] });
    await ready;
    expect(visibleBackground((await get()).slides[0]!).status).toBe("running");
    expect((await req(`${base}/cancel`, "POST", {})).status).toBe(200);
    await wait(response);
    expect((await get()).slides[0]!.background).toMatchObject({ status: "done", generatedStatus: "failed", generatedError: "취소했습니다" });
    await carousels.updateSlideEngineFields(c.id, "slide-1", { background: { generatedStatus: "running" } });
    const restarted = await new CarouselStore(root).requireCarousel(c.id);
    expect(restarted.slides[0]!.background).toMatchObject({ status: "done", generatedStatus: "failed", generatedError: "앱이 닫혀 중단됨" });
  });
  it("모드가 없는 저장본은 API에서도 원본 장면으로 유지한다", async () => {
    const { c, base, req, wait, get, carousels, generateImage } = await setup();
    const file = path.join(carousels.carouselDir(c.id), "carousel.json");
    const raw = JSON.parse(await readFile(file, "utf8"));
    for (const slide of raw.slides) delete slide.background.mode;
    await writeFile(file, JSON.stringify(raw));
    expect((await get()).slides.every(s => s.background.kind === "frame" && s.background.mode === "frame")).toBe(true);
    await wait(await req(`${base}/generate`, "POST", {}));
    expect(generateImage).not.toHaveBeenCalled();
  });
  it("강조 API는 생성 이미지를 입력으로 쓰고 생성 파일과 윤곽 파일을 따로 보존한다", async () => {
    const { c, base, req, wait, get, carousels, generateImage, askBox } = await setup();
    await wait(await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] }));
    const generatedFile = visibleBackground((await get()).slides[0]!).file!;
    const absolute = path.join(carousels.carouselDir(c.id), generatedFile);
    expect((await req(`${base}/slides/slide-1/highlight`, "POST", { style: "border", target: "상품" })).status).toBe(200);
    expect(askBox).toHaveBeenLastCalledWith(expect.objectContaining({ imagePath: absolute }));
    await wait(await req(`${base}/slides/slide-1/highlight`, "POST", { style: "ai-outline", target: "상품" }));
    expect(generateImage).toHaveBeenLastCalledWith(expect.objectContaining({ referenceImage: absolute, instruction: expect.stringContaining("흰 윤곽") }));
    const outline = visibleBackground((await get()).slides[0]!).file!;
    expect(outline).not.toBe(generatedFile);
    expect(await readFile(absolute, "utf8")).toBe("generated");
    expect(await readdir(path.join(carousels.carouselDir(c.id), "images"))).toEqual(["slide-1-1.png", "slide-1-gen-1.png"]);
  });
  it("다시 만들기가 실패해도 같은 프레임의 생성 파일은 모드 전환으로 재사용한다", async () => {
    const { base, req, wait, get, generateImage } = await setup();
    await wait(await req(`${base}/generate`, "POST", { slideIds: ["slide-1"] }));
    const file = visibleBackground((await get()).slides[0]!).file;
    generateImage.mockRejectedValueOnce(new Error("다시 만들기 실패"));
    await wait(await req(`${base}/slides/slide-1/regenerate`, "POST", {}));
    await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "frame" } });
    const reused = await req(`${base}/slides/slide-1`, "PATCH", { background: { mode: "ai" } });
    expect(reused.status).toBe(200);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(visibleBackground((await get()).slides[0]!)).toMatchObject({ file, status: "done", error: undefined });
  });
});
