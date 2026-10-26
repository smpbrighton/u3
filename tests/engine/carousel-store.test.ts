import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
      { id: "s1", title: "처음", body: "본문", textPlacement: "top", imagePrompt: "처음 지시문", status: "queued" },
    ] });
    await store.updateSlideEngineFields(created.id, "s1", { image: { file: "images/s1-1.png", version: 1 }, status: "done" });
    await store.updateSlideUserFields(created.id, "s1", { title: "수정 제목", body: "수정 본문", textPlacement: "bottom", imagePrompt: "수정 지시문" });
    const result = await store.getCarousel(created.id);
    expect(result?.slides[0]).toMatchObject({
      title: "수정 제목", body: "수정 본문", textPlacement: "bottom", imagePrompt: "수정 지시문",
      image: { file: "images/s1-1.png", version: 1 }, status: "done",
    });
  });

  it("merges user highlight edits with engine-owned frame and preserves a manually edited box", async () => {
    const store = await storeWith();
    const created = await store.createCarousel({ name: "영상", source: { kind: "project", projectId: "p1", projectName: "프로젝트" }, aspect: "4:5", slides: [
      { id: "s1", title: "제목", body: "본문", textPlacement: "bottom", background: { kind: "frame", sec: 2, cropY: 0.5, status: "idle", highlight: { style: "border", target: "상품", box: { left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 } } } },
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
      { id: "s1", title: "대기", body: "", textPlacement: "center", imagePrompt: "", status: "queued" },
      { id: "s2", title: "중단", body: "", textPlacement: "center", imagePrompt: "", status: "running" },
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
      { id: "s1", title: "", body: "", textPlacement: "center", imagePrompt: "", status: "running" },
    ] });
    await store.saveImageVersion(created.id, "s1", Buffer.from("first"));
    await store.saveImageVersion(created.id, "s1", Buffer.from("second"));
    const dir = path.join(store.carouselDir(created.id), "images");
    const files = await import("node:fs/promises").then(fs => fs.readdir(dir));
    expect(files).toEqual(["s1-2.png"]);
    expect(await readFile(path.join(dir, files[0]!))).toEqual(Buffer.from("second"));
  });
});
