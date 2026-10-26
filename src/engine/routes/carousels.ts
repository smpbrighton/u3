import type { Hono } from "hono";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CarouselStore } from "../carousel-store";
import { ImageQueue } from "../image-queue";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { fileUsageLog, makeUsageEntry } from "../pipeline/usage";
import { codexCliRunner } from "../pipeline/codex";
import { runCodexImage } from "../pipeline/codex-image";
import { carouselFolderName, nextCarouselFolderName, receivedSlideFileName } from "../../core/carousel";

const RefineSchema = z.object({ candidates: z.array(z.object({ topic: z.string().min(1), angle: z.string().min(1) })).length(3) });
const PlanSchema = z.object({ style: z.string().min(1), slides: z.array(z.object({ title: z.string(), body: z.string(), imagePrompt: z.string().min(1) })) });
const ImageOptions = z.object({ model: z.enum(["flare", "sunburst"]), quality: z.enum(["low", "medium", "high", "auto"]), aspect: z.enum(["4:5", "1:1"]), concurrency: z.number().int().min(1).max(10) });
const DEFAULT_IMAGE_OPTIONS = { model: "flare" as const, quality: "auto" as const, aspect: "4:5" as const, concurrency: 3 };

function carouselStore(context: AppContext): CarouselStore {
  return context.carouselStore ?? new CarouselStore(context.store.root, id => context.jobs.hasActiveForProject(id));
}
function imageQueue(context: AppContext): ImageQueue { return context.imageQueue ?? new ImageQueue(); }
async function options(context: AppContext) {
  const settings = await context.store.readSettings();
  const parsed = ImageOptions.safeParse(settings.imageOptions);
  return parsed.success ? parsed.data : DEFAULT_IMAGE_OPTIONS;
}
async function recordCodexUsage(root: string, usage: Record<string, number>, projectId: string | null): Promise<void> {
  const entries = Object.entries(usage).filter(([, amount]) => Number.isFinite(amount) && amount >= 0).map(([unit, amount]) => makeUsageEntry({ provider: "codex", unit, amount, projectId }));
  await fileUsageLog(root).append(entries);
}

export function registerCarouselRoutes(app: Hono, context: AppContext): void {
  const store = carouselStore(context); const queue = imageQueue(context);
  app.get("/api/carousels", async c => c.json(await store.listCarousels()));
  app.post("/api/carousels", async c => {
    const input = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120).optional(), topic: z.string().trim().min(1).max(1000), slideCount: z.number().int().min(2).max(10).default(5) }));
    const imageOptions = await options(context);
    const value = await store.createCarousel({ name: input.name ?? input.topic.slice(0, 60), topic: input.topic, aspect: imageOptions.aspect, style: "", slides: Array.from({ length: input.slideCount }, (_, index) => ({ id: `slide-${index + 1}`, title: "", body: "", textPlacement: "bottom" as const, imagePrompt: "", status: "idle" as const })) });
    return c.json(value, 201);
  });
  app.get("/api/carousels/:id", async c => c.json(await store.requireCarousel(c.req.param("id"))));
  app.put("/api/carousels/:id", async c => {
    const fields = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120).optional(), topic: z.string().trim().min(1).max(1000).optional() }).refine(value => Object.keys(value).length > 0));
    return c.json(await store.updateCarouselFields(c.req.param("id"), fields));
  });
  app.delete("/api/carousels/:id", async c => { await store.deleteCarousel(c.req.param("id")); return c.json({ result: "deleted" }); });
  app.patch("/api/carousels/:id/slides/:slideId", async c => {
    const fields = await parseJson(c, z.object({ title: z.string().max(500).optional(), body: z.string().max(5000).optional(), textPlacement: z.enum(["top", "center", "bottom"]).optional(), imagePrompt: z.string().max(4000).optional() }).refine(value => Object.keys(value).length > 0));
    return c.json(await store.updateSlideUserFields(c.req.param("id"), c.req.param("slideId"), fields));
  });

  app.post("/api/carousels/refine", async c => {
    const input = await parseJson(c, z.object({ topic: z.string().trim().min(1).max(1000) }));
    let result: { candidates: Array<{ topic: string; angle: string }>; usage: Record<string, number> };
    if (context.carouselServices) result = await context.carouselServices.refine(input);
    else {
      const bin = await context.codexPath(); if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
      result = await codexCliRunner(await codexRunnerOptions(context, bin)).run({ schema: RefineSchema, prompt: `사용자 주제에 맞는 캐러셀 기획 후보를 정확히 3개 제안하세요. 각 후보는 고친 주제와 한 줄 각도를 포함합니다.\n주제: ${input.topic}` }).then(out => ({ ...out.output, usage: out.usage }));
    }
    const parsed = RefineSchema.parse({ candidates: result.candidates }); await recordCodexUsage(context.store.root, result.usage, null);
    return c.json(parsed);
  });

  app.post("/api/carousels/:id/plan", async c => {
    const id = c.req.param("id"); const carousel = await store.requireCarousel(id);
    const input = await parseJson(c, z.object({ topic: z.string().trim().min(1).max(1000).optional() }));
    const topic = input.topic ?? carousel.topic; const count = carousel.slides.length;
    let result: { style: string; slides: Array<{ title: string; body: string; imagePrompt: string }>; topic?: string; usage: Record<string, number> };
    if (context.carouselServices) result = await context.carouselServices.plan({ topic, count });
    else {
      const bin = await context.codexPath(); if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
      const settings = await context.store.readSettings();
      result = await codexCliRunner({ bin, model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium") }).run({ schema: PlanSchema, prompt: `주제로 정확히 ${count}장의 캐러셀을 기획하세요. 장마다 제목, 본문, 이미지 지시문을 작성하고 공통 화풍을 정하세요. 대본 프롬프트는 쓰지 마세요.\n주제: ${topic}` }).then(out => ({ ...out.output, usage: out.usage }));
    }
    const parsed = PlanSchema.safeParse({ style: result.style, slides: result.slides });
    if (!parsed.success || parsed.data.slides.length !== count) throw new HttpError(502, "invalid-plan", "Codex 기획 결과가 요청한 장 수와 맞지 않습니다");
    const updated = await store.replacePlan(id, { topic: result.topic ?? topic, style: parsed.data.style, slides: parsed.data.slides });
    await recordCodexUsage(context.store.root, result.usage, id);
    return c.json(updated, 202);
  });

  app.post("/api/carousels/:id/generate", async c => {
    const id = c.req.param("id"); const input = await parseJson(c, z.object({ slideIds: z.array(z.string().min(1)).optional() }));
    const carousel = await store.requireCarousel(id); const imageOptions = await options(context);
    queue.setConcurrency(imageOptions.concurrency);
    const selected = carousel.slides.filter(slide => !input.slideIds || input.slideIds.includes(slide.id));
    if (input.slideIds?.some(slideId => !carousel.slides.some(slide => slide.id === slideId))) throw new HttpError(404, "slide-not-found", "장이 없습니다");
    if (selected.some(slide => !slide.imagePrompt.trim())) throw new HttpError(400, "missing-plan", "이미지 지시문이 없는 장이 있습니다");
    await Promise.all(selected.map(slide => store.updateSlideEngineFields(id, slide.id, { status: "queued", error: undefined })));
    const jobs = selected.map(slide => context.jobs.startImage({ projectId: id, sceneIndex: carousel.slides.findIndex(item => item.id === slide.id), label: `${carousel.name} · ${slide.title || slide.id}`, key: `carousel:${id}:${slide.id}`, queued: true, cancellable: true }, async jobContext => {
      await store.updateSlideEngineFields(id, slide.id, { status: "running", error: undefined }); jobContext.progress(0.05, "이미지 생성 중");
      try {
        const output = path.join(store.carouselDir(id), "images", `${slide.id}-working.png`);
        const settings = await context.store.readSettings();
        const generated = context.carouselServices
          ? await context.carouselServices.generateImage({ prompt: slide.imagePrompt, style: carousel.style, model: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, output, signal: jobContext.signal })
          : await runCodexImage({ bin: (await context.codexPath()) ?? (() => { throw new Error("Codex CLI를 찾지 못했습니다"); })(), model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium"), imageModel: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, prompt: slide.imagePrompt, style: carousel.style, output, signal: jobContext.signal });
        const file = Buffer.isBuffer(generated) ? generated : await readFile(generated.output);
        const saved = await store.saveImageVersion(id, slide.id, file);
        if (!Buffer.isBuffer(generated)) await rm(generated.output, { force: true });
        if (!Buffer.isBuffer(generated)) await recordCodexUsage(context.store.root, generated.usage, id);
        jobContext.progress(1, "이미지 생성 완료");
        return { kind: "done" as const, result: saved.slides.find(item => item.id === slide.id)?.image };
      } catch (error) {
        await rm(path.join(store.carouselDir(id), "images", `${slide.id}-working.png`), { force: true }).catch(() => undefined);
        await store.updateSlideEngineFields(id, slide.id, { status: "failed", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
        throw error;
      }
    }, queue.queue));
    return c.json({ jobs }, 202);
  });
  app.post("/api/carousels/:id/cancel", async c => {
    const id = c.req.param("id"); const carousel = await store.requireCarousel(id);
    const active = context.jobs.list({ projectId: id }).filter(job => job.kind === "image" && (job.status === "queued" || job.status === "running"));
    const results = active.map(job => context.jobs.cancel(job.id));
    await Promise.all(active.flatMap(job => {
      const slide = carousel.slides[job.sceneIndex ?? -1];
      return slide ? [store.updateSlideEngineFields(id, slide.id, { status: "failed", error: "취소했습니다" })] : [];
    }));
    await queue.onIdle();
    return c.json({ results });
  });
  app.post("/api/carousels/:id/download", async c => {
    const id = c.req.param("id"); const { dir } = await parseJson(c, z.object({ dir: z.string().min(1) }));
    const carousel = await store.requireCarousel(id);
    const done = carousel.slides.filter(slide => slide.image && slide.status === "done");
    const targetRoot = path.resolve(dir); await mkdir(targetRoot, { recursive: true });
    const existing = await readdir(targetRoot); const folder = nextCarouselFolderName(carouselFolderName(carousel.name), existing);
    const destination = path.join(targetRoot, folder); await mkdir(destination);
    if (!context.composeCarouselSlide) throw new HttpError(503, "composer-unavailable", "최종 이미지 합성은 CarouselSlide 구현 뒤 사용할 수 있습니다");
    for (const [index, slide] of done.entries()) await context.composeCarouselSlide(carousel, slide, path.join(destination, receivedSlideFileName(index)));
    return c.json({ directory: destination, files: done.map((_, index) => receivedSlideFileName(index)) });
  });
  app.get("/api/carousels/:id/files/*", async c => {
    const carousel = await store.requireCarousel(c.req.param("id"));
    const relative = decodeURIComponent(c.req.path.slice(`/api/carousels/${carousel.id}/files/`.length));
    if (!relative || relative.includes("\0") || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new HttpError(403, "forbidden", "캐러셀 밖의 파일을 읽을 수 없습니다");
    const root = path.resolve(store.carouselDir(carousel.id)); const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new HttpError(403, "forbidden", "캐러셀 밖의 파일을 읽을 수 없습니다");
    const info = await stat(file).catch(() => null); if (!info?.isFile()) throw new HttpError(404, "not-found", "파일이 없습니다");
    return new Response(await readFile(file), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  });
}

async function codexRunnerOptions(context: AppContext, bin: string) {
  const settings = await context.store.readSettings();
  return { bin, model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium") };
}
function stringSetting(value: unknown, fallback: string): string { return typeof value === "string" && value ? value : fallback; }
