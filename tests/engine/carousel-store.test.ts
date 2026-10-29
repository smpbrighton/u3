import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultTexts, newSlide, textsFromLegacy } from "../../src/core/carousel";
import { CarouselStore } from "../../src/engine/carousel-store";

const roots: string[] = [];
async function storeWith(active = () => false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-carousel-store-"));
  roots.push(root);
  return new CarouselStore(root, active, () => new Date("2026-10-26T00:00:00.000Z"));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("CarouselStore", () => {
  it("keeps engine image results when user fields are saved", async () => {
    const store = await storeWith();
    const created = await store.createCarousel({ name: "이름", topic: "주제", aspect: "4:5", style: "사진", slides: [
      { id: "s1", texts: textsFromLegacy({ title: "처음", body: "본문", textPlacement: "top" }, "4:5"), imagePrompt: "처음 지시문", status: "queued" },
    ] });
    await store.updateSlideEngineFields(created.id, "s1", { image: { file: "images/s1-1.png", version: 1 }, status: "done" });
    await store.updateSlideUserFields(created.id, "s1", { texts: textsFromLegacy({ title: "수정 제목", body: "수정 본문", textPlacement: "bottom" }, "4:5"), imagePrompt: "수정 지시문" });
    const result = await store.getCarousel(created.id);
    expect(result?.slides[0]).toMatchObject({
      texts: textsFromLegacy({ title: "수정 제목", body: "수정 본문", textPlacement: "bottom" }, "4:5"), imagePrompt: "수정 지시문",
      image: { file: "images/s1-1.png", version: 1 }, status: "done",
    });
  });

  it("merges user highlight edits with engine-owned frame and preserves a manually edited box", async () => {
    const store = await storeWith();
    const created = await store.createCarousel({ name: "영상", source: { kind: "project", projectId: "p1", projectName: "프로젝트" }, aspect: "4:5", slides: [
      { id: "s1", texts: defaultTexts("4:5"), background: { kind: "frame", sec: 2, cropY: 0.5, status: "idle", highlight: { style: "border", target: "상품", box: { left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 } } } },
    ] });
    await store.updateSlideEngineFields(created.id, "s1", { background: { frame: { file: "frames/s1-1.png" }, highlight: { box: { left: 0.2, top: 0.3, right: 0.7, bottom: 0.9 } }, status: "done" } });
    await store.updateSlideUserFields(created.id, "s1", { background: { kind: "frame", sec: 5, cropY: 0.4, highlight: { style: "dim", target: "수정한 대상", box: { left: 0.15, top: 0.25, right: 0.65, bottom: 0.85 } } } });
    const result = await store.getCarousel(created.id);
    expect(result?.slides[0]?.background).toMatchObject({
      kind: "frame", sec: 5, cropY: 0.4, frame: { file: "frames/s1-1.png" }, status: "done",
      highlight: { style: "dim", target: "수정한 대상", box: { left: 0.15, top: 0.25, right: 0.65, bottom: 0.85 } },
    });
  });

  it("marks queued and running slides failed when no active job exists", async () => {
    const store = await storeWith();
    const created = await store.createCarousel({ name: "이름", topic: "주제", aspect: "1:1", style: "사진", slides: [
      { id: "s1", texts: defaultTexts("1:1"), imagePrompt: "", status: "queued" },
      { id: "s2", texts: defaultTexts("1:1"), imagePrompt: "", status: "running" },
    ] });
    const result = await store.getCarousel(created.id);
    expect(result?.slides.map(slide => [slide.status, slide.error])).toEqual([
      ["failed", "앱이 닫혀 중단됨"], ["failed", "앱이 닫혀 중단됨"],
    ]);
  });

  it("refuses deletion while image generation is active", async () => {
    const store = await storeWith(() => true);
    const created = await store.createCarousel({ name: "이름", topic: "주제", aspect: "4:5", style: "사진", slides: [] });
    await expect(store.deleteCarousel(created.id)).rejects.toMatchObject({ code: "active-job" });
  });

  it("writes new image versions atomically and removes the prior file", async () => {
    const store = await storeWith();
    const created = await store.createCarousel({ name: "이름", topic: "주제", aspect: "4:5", style: "사진", slides: [
      { id: "s1", texts: defaultTexts("4:5"), imagePrompt: "", status: "running" },
    ] });
    await store.saveImageVersion(created.id, "s1", Buffer.from("first"));
    await store.saveImageVersion(created.id, "s1", Buffer.from("second"));
    const dir = path.join(store.carouselDir(created.id), "images");
    const files = await import("node:fs/promises").then(fs => fs.readdir(dir));
    expect(files).toEqual(["s1-2.png"]);
    expect(await readFile(path.join(dir, files[0]!))).toEqual(Buffer.from("second"));
  });
});


describe("carousel review storage", () => {
  async function review(store: CarouselStore) {
    return store.createCarousel({ name: "검토", topic: "주제", aspect: "4:5", stage: "review", caption: "캡션", slides: [
      newSlide({ kind: "topic" }, "4:5"), { ...newSlide({ kind: "topic" }, "4:5"), id: "slide-2" },
    ] });
  }
  it("enforces 2–10 slides and exact reorder ids in review only", async () => {
    const store = await storeWith(); const c = await review(store);
    expect(c).toMatchObject({ stage: "review", caption: "캡션" });
    await expect(store.removeSlide(c.id, "slide-1")).rejects.toMatchObject({ status: 409 });
    for (let n = 2; n < 10; n++) await store.addSlide(c.id);
    await expect(store.addSlide(c.id)).rejects.toMatchObject({ status: 409 });
    const full = await store.requireCarousel(c.id); const ids = full.slides.map(s => s.id).reverse();
    expect(new Set(ids).size).toBe(10);
    expect((await store.reorderSlides(c.id, ids)).slides.map(s => s.id)).toEqual(ids);
    await expect(store.reorderSlides(c.id, ids.slice(1))).rejects.toMatchObject({ status: 400 });
    await expect(store.reorderSlides(c.id, ids.map(() => ids[0]!))).rejects.toMatchObject({ status: 400 });
    await expect(store.reorderSlides(c.id, [...ids.slice(1), "missing"])).rejects.toMatchObject({ status: 400 });
    await expect(store.removeSlide(c.id, "missing")).rejects.toMatchObject({ status: 404 });
    expect((await store.removeSlide(c.id, ids[0]!)).slides).toHaveLength(9);
    await store.setStage(c.id, "images");
    for (const action of [() => store.addSlide(c.id), () => store.removeSlide(c.id, ids[1]!), () => store.reorderSlides(c.id, ids.slice(1))]) {
      await expect(action()).rejects.toMatchObject({ status: 409 });
    }
    expect((await store.updateCarouselFields(c.id, { caption: "고친 캡션", style: "사진" })).caption).toBe("고친 캡션");
  });
  it("preserves the frame, scene and user image when replacing a plan", async () => {
    const store = await storeWith();
    const source = { kind: "project" as const, projectId: "p", projectName: "영상" };
    const slide = { ...newSlide(source, "4:5"), sceneNumber: 2, background: { kind: "frame" as const, sec: 4, cropY: 0.2, status: "done" as const, frame: { file: "frames/s.png" } } };
    const c = await store.createCarousel({ name: "영상", source, stage: "review", aspect: "4:5", slides: [slide] });
    const result = await store.replacePlan(c.id, { caption: "게시 글", slides: [{ title: "새 제목", body: "새 본문", imagePrompt: "" }] });
    expect(result.slides[0]!.background).toEqual({ ...slide.background, mode: "ai", generatedStatus: "idle" });
    expect(result.slides[0]!.sceneNumber).toBe(2);
    expect(result.slides[0]!.texts.map(t => t.text)).toEqual(["새 제목", "새 본문"]);
    expect(result.caption).toBe("게시 글");
    const replanned = await store.replacePlan(c.id, { slides: [{ title: "다음", body: "글", sceneNumber: 3, sec: 8, target: "상품" }] });
    expect(replanned.slides[0]).toMatchObject({ sceneNumber: 3, background: { sec: 8, cropY: 0.2, frame: { file: "frames/s.png" }, highlight: { target: "상품" } } });
  });
  it("copies a logo snapshot and persists text, logo and background user fields", async () => {
    const store = await storeWith(); const c = await review(store);
    const fs = await import("node:fs/promises"); const src = path.join(path.dirname(store.root), "watermark.webp");
    await fs.writeFile(src, "원본 로고");
    const file = await store.copyLogo(c.id, src);
    expect(file).toBe("logos/logo.webp");
    await fs.writeFile(src, "바꾼 로고");
    expect(await fs.readFile(path.join(store.carouselDir(c.id), file), "utf8")).toBe("원본 로고");
    const logo = { enabled: true, file, x: 0.5, y: 0.1, width: 0.2, opacity: 0.8 };
    const texts = defaultTexts("4:5").map(t => ({ ...t, text: "수정" }));
    const result = await store.updateSlideUserFields(c.id, "slide-1", { texts, logo, brightness: 1.5, shade: 0.6, sceneNumber: 2 });
    expect(result.slides[0]).toMatchObject({ texts, logo, brightness: 1.5, shade: 0.6, sceneNumber: 2 });
    const raw = JSON.parse(await fs.readFile(path.join(store.carouselDir(c.id), "carousel.json"), "utf8"));
    expect(raw.slides[0]).not.toHaveProperty("title");
    expect(raw.slides[0]).not.toHaveProperty("textPlacement");
  });
});
