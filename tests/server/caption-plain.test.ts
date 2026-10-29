import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Carousel } from "../../src/core/carousel";
import { captionLayersOf, withCaptionLayers } from "../../src/core/schema";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../src/engine/pipeline/codex", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/engine/pipeline/codex")>(), codexCliRunner: () => ({ run }),
}));
const roots: string[] = [];
beforeEach(() => run.mockReset());
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-caption-plain-")); roots.push(root);
  const store = new Store(root); const jobs = new Jobs();
  const fixture = JSON.parse(await readFile("tests/fixtures/project/project.json", "utf8"));
  const base = await store.saveProject(fixture);
  const project = await store.saveProject({ ...base, timeline: withCaptionLayers(base.timeline, captionLayersOf(base.timeline).map((l, i) => i === 0
    ? { ...l, main: [{ id: "c", startSec: 0, endSec: 1, text: "*강조* 자막" }] } : l)) });
  await writeFile(path.join(store.projectDir(project.id), "script.json"), JSON.stringify({ scenes: [{ inputIndex: 1, caption: "대본 *강조*", startSec: 0, endSec: 1, reaction: null, sfxCategory: null }] }));
  const derivePlan = vi.fn(async (_input: { prompt: string; projectId: string; count: number }) => ({ slides: [1, 2].map(() => ({ sceneNumber: 1, title: "제목", body: "본문", target: "*상품*" })), usage: {} }));
  const askBox = vi.fn(async () => ({ box: { left: 0, top: 0, right: 1, bottom: 1 }, confidence: 1, usage: { input_tokens: 0, output_tokens: 0 }, model: "fake" }));
  const app = createApp({ store, jobs, token: "token", codexPath: async () => "fake", jevKey: async () => "key",
    carouselServices: { refine: async () => ({ candidates: [], usage: {} }), plan: async () => ({ slides: [], usage: {} }), generateImage: async () => Buffer.from("png"),
      derivePlan, askBox, renderFrame: async ({ outputPath }) => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, "png"); } } });
  const req = (url: string, method: string, body: unknown) => app.request(url, { method, headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body) });
  return { project, req, jobs, derivePlan, askBox };
}

describe("자막 글 소비 경로", () => {
  it("번역 프롬프트에 강조 표기가 없고 번역 결과는 그대로 돌려준다", async () => {
    const { project, req } = await setup();
    run.mockResolvedValue({ output: { captions: [{ id: "c", text: "Translated" }] }, usage: {} });
    const response = await req(`/api/projects/${project.id}/captions/translate`, "POST", { layerId: captionLayersOf(project.timeline)[0]!.id });
    expect(response.status).toBe(200);
    expect(run.mock.calls[0]![0].prompt).not.toContain("*");
    expect(run.mock.calls[0]![0].prompt).toContain("강조 자막");
    expect(run.mock.calls[0]![0].prompt).toMatch(/asterisk/i);
    expect(await response.json()).toEqual({ captions: [{ id: "c", text: "Translated" }] });
  });

  it("제목 프롬프트의 메인·서브 글에 강조 표기가 없다", async () => {
    const { project, req } = await setup();
    run.mockResolvedValue({ output: { title: "제목" }, usage: {} });
    const response = await req(`/api/projects/${project.id}/title`, "POST", { scenes: [{ caption: "*메인* 글", subCaption: "*서브* 글" }] });
    expect(response.status).toBe(200);
    expect(run.mock.calls[0]![0].prompt).not.toContain("*");
    expect(run.mock.calls[0]![0].prompt).toContain("서브 글");
  });

  it("파생 기획·재기획의 타임라인·대본 자막과 생성·재추출·직접 지정의 Jev 대상을 정리한다", async () => {
    const { project, req, derivePlan, askBox, jobs } = await setup();
    const response = await req(`/api/projects/${project.id}/carousel`, "POST", { count: 2 });
    expect(response.status).toBe(201);
    const { carousel } = await response.json() as { carousel: Carousel };
    await req(`/api/carousels/${carousel.id}/plan`, "POST", {});
    expect(derivePlan).toHaveBeenCalledTimes(2);
    for (const call of derivePlan.mock.calls) {
      expect(call[0].prompt).not.toContain("*");
      expect(call[0].prompt).toContain("강조 자막");
      expect(call[0].prompt).toContain("대본 강조");
    }
    const generated = await req(`/api/carousels/${carousel.id}/generate`, "POST", {});
    expect(generated.status).toBe(202);
    const started = await generated.json() as { jobs: Array<{ id: string }> };
    for (const job of started.jobs) expect((await jobs.wait(job.id)).status).toBe("done");
    expect(askBox).toHaveBeenCalledTimes(2);
    expect(askBox).toHaveBeenCalledWith(expect.objectContaining({ target: "상품" }));
    const url = `/api/carousels/${carousel.id}/slides/${carousel.slides[0]!.id}`;
    const reextracted = await req(`${url}/frame`, "POST", { sec: 0.5, cropY: 0.5 });
    expect(reextracted.status).toBe(202);
    const { job } = await reextracted.json() as { job: { id: string } };
    expect((await jobs.wait(job.id)).status).toBe("done");
    expect((await req(`${url}/highlight`, "POST", { style: "border", target: "*새 대상*" })).status).toBe(200);
    expect(askBox).toHaveBeenLastCalledWith(expect.objectContaining({ target: "새 대상" }));
  });
});
