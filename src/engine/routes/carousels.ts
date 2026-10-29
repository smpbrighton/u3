import type { Hono } from "hono";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CarouselStore } from "../carousel-store";
import { ImageQueue } from "../image-queue";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { fileUsageLog, makeUsageEntry } from "../pipeline/usage";
import { codexCliRunner } from "../pipeline/codex";
import { runCodexImage, type CodexImageOptions } from "../pipeline/codex-image";
import { codexModelSwitchMessage, codexSelection, withCodexModelFallback } from "../codex-settings";
import { Carousel, CarouselBox, CarouselTexts, CarouselLogo, defaultTexts, newSlide, visibleBackground, carouselFolderName, nextCarouselFolderName, receivedSlideFileName, type CarouselSlide } from "../../core/carousel";
import { CodexScript, BrandSettings, DEFAULT_BRAND_SETTINGS, captionLayersOf } from "../../core/schema";
import { sceneFrameSec } from "../../core/carousel-frame";
import { renderCarouselFrame } from "../pipeline/carousel-frame";
import { askJevBox } from "../pipeline/jev-box";
import { videoDuration as timelineVideoDuration } from "../../core/timeline/ops";
import { plainCaptionText } from "../../core/captions";
import { carouselTopicPrompt, carouselVideoPrompt, resolveCarouselPrompt } from "../../core/carousel-prompt";

const RefineSchema = z.object({ candidates: z.array(z.object({ topic: z.string().min(1), angle: z.string().min(1) })).length(3) });
const PlanSchema = z.object({ caption: z.string().max(2000).default(""), style: z.string().optional(), slides: z.array(z.object({ title: z.string().max(5000), body: z.string().max(5000), imagePrompt: z.string().max(4000) })) });
const DerivedPlanSchema = z.object({ caption: z.string().max(2000).default(""), style: z.string().max(1000).optional(), slides: z.array(z.object({ sceneNumber: z.number().int().positive(), title: z.string().max(5000), body: z.string().max(5000), target: z.string().max(1000), imagePrompt: z.string().max(4000).default("") })) });
const ImageOptions = z.object({ model: z.enum(["flare", "sunburst"]), quality: z.enum(["low", "medium", "high", "auto"]), aspect: z.enum(["4:5", "1:1", "9:16", "16:9"]), concurrency: z.number().int().min(1).max(10) });
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
async function recordProviderUsage(root: string, provider: string, usage: Record<string, number>, projectId: string): Promise<void> {
  const entries = Object.entries(usage).filter(([, amount]) => Number.isFinite(amount) && amount >= 0).map(([unit, amount]) => makeUsageEntry({ provider: "jev", unit, amount, projectId }));
  await fileUsageLog(root).append(entries);
}

function backgroundStatus(slide: CarouselSlide, status: CarouselSlide["status"], error?: string) {
  if (slide.background.kind !== "frame") return { status, error };
  return { background: slide.background.mode === "ai" ? { generatedStatus: status, generatedError: error } : { status, error } };
}
async function renderProjectFrame(context: AppContext, project: import("../../core/schema").Project, sec: number, outputPath: string): Promise<void> {
  const projectFolder = path.resolve(context.store.projectDir(project.id));
  const configuredLibrary = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
  const libraryFolder = path.resolve(path.basename(configuredLibrary) === "library" ? configuredLibrary : path.join(configuredLibrary, "library"));
  const resolveMediaUrl = (absolutePath: string) => {
    if (absolutePath === projectFolder || absolutePath.startsWith(`${projectFolder}${path.sep}`)) {
      return context.mediaServer?.url("projects", `${project.id}/${path.relative(projectFolder, absolutePath)}`) ?? absolutePath;
    }
    if (absolutePath === libraryFolder || absolutePath.startsWith(`${libraryFolder}${path.sep}`)) {
      return context.mediaServer?.url("library", path.relative(libraryFolder, absolutePath)) ?? absolutePath;
    }
    return absolutePath;
  };
  await renderCarouselFrame({ timeline: project.timeline, inputs: project.inputs.filter(item => item.id !== "placeholder"), projectFolder, libraryFolder, sec, outputPath, resolveMediaUrl });
}

export function registerCarouselRoutes(app: Hono, context: AppContext): void {
  const store = carouselStore(context); const queue = imageQueue(context);
  async function queueDerived(carousel: Carousel, slide: CarouselSlide, extract: boolean) {
    const key = `carousel:${carousel.id}:${slide.id}`;
    const active = context.jobs.findActive(key);
    if (active) return active;
    const imageOptions = await options(context); queue.setConcurrency(imageOptions.concurrency);
    await store.updateSlideEngineFields(carousel.id, slide.id, backgroundStatus(slide, "queued"));
    return context.jobs.startImage({ projectId: carousel.id, sceneIndex: carousel.slides.indexOf(slide), label: `${carousel.name} · ${slide.texts[0]?.text || slide.id}`, key, queued: true, cancellable: true }, async ctx => {
      const output = path.join(store.carouselDir(carousel.id), "images", `${slide.id}-gen-working.png`);
      try {
        await store.updateSlideEngineFields(carousel.id, slide.id, backgroundStatus(slide, "running"));
        await store.clearBackgroundHighlight(carousel.id, slide.id);
        if (extract) await extractSlideFrame(context, store, carousel.id, slide.id, ctx.signal);
        ctx.signal.throwIfAborted();
        const fresh = await store.requireCarousel(carousel.id);
        const current = fresh.slides.find(item => item.id === slide.id)!;
        if (current.background.kind !== "frame") throw new Error("프레임 배경이 아닙니다");
        let message: string | undefined;
        if (current.background.mode === "ai") {
          if (!current.background.frame?.file) throw new HttpError(409, "frame-missing", "참고 프레임이 없습니다");
          const prompt = current.imagePrompt.trim() || `${current.texts.map(text => text.text).filter(Boolean).join("\n")}\n강조 대상: ${current.background.highlight?.target ?? ""}`;
          const referenceImage = path.join(store.carouselDir(carousel.id), current.background.frame.file);
          ctx.progress(0.2, "이미지 생성 중");
          const generated = context.carouselServices
            ? await context.carouselServices.generateImage({ prompt, style: fresh.style ?? "", referenceImage, model: imageOptions.model, quality: imageOptions.quality, aspect: fresh.aspect, output, signal: ctx.signal })
            : await runCarouselImage(context, { prompt, style: fresh.style ?? "", referenceImage, imageModel: imageOptions.model, quality: imageOptions.quality, aspect: fresh.aspect, output, signal: ctx.signal }).then(attempt => { message = codexModelSwitchMessage(attempt); return attempt.value; });
          ctx.signal.throwIfAborted();
          await store.saveGeneratedVersion(carousel.id, slide.id, Buffer.isBuffer(generated) ? generated : await readFile(generated.output));
          if (!Buffer.isBuffer(generated)) {
            await rm(generated.output, { force: true });
            await recordCodexUsage(context.store.root, generated.usage, carousel.id);
          }
          await automaticBox(context, store, carousel.id, slide.id, ctx.signal);
        }
        ctx.progress(1, "이미지 생성 완료");
        return { kind: "done", result: { carouselId: carousel.id, slideId: slide.id }, ...(message ? { message } : {}) };
      } catch (error) {
        await store.updateSlideEngineFields(carousel.id, slide.id, backgroundStatus(slide, "failed", ctx.signal.aborted ? "취소했습니다" : error instanceof Error ? error.message : String(error))).catch(() => undefined);
        throw error;
      } finally { await rm(output, { force: true }); }
    }, queue.queue);
  }
  app.get("/api/carousels", async c => c.json(await store.listCarousels()));
  app.post("/api/carousels", async c => {
    const input = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120).optional(), topic: z.string().trim().min(1).max(1000), slideCount: z.number().int().min(2).max(10).default(5), style: z.string().max(1000).optional(), aspect: ImageOptions.shape.aspect.optional() }));
    const imageOptions = await options(context);
    const aspect = input.aspect ?? imageOptions.aspect;
    const value = await store.createCarousel({ name: input.name ?? input.topic.slice(0, 60), topic: input.topic, aspect, style: input.style, stage: "review", slides: Array.from({ length: input.slideCount }, (_, index) => ({ ...newSlide({ kind: "topic" }, aspect), id: `slide-${index + 1}` })) });
    return c.json(value, 201);
  });
  app.get("/api/carousels/:id", async c => c.json(await store.requireCarousel(c.req.param("id"))));
  app.put("/api/carousels/:id", async c => {
    const fields = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120).optional(), topic: z.string().trim().min(1).max(1000).optional() }).refine(value => Object.keys(value).length > 0));
    return c.json(await store.updateCarouselFields(c.req.param("id"), fields));
  });
  app.delete("/api/carousels/:id", async c => { await store.deleteCarousel(c.req.param("id")); return c.json({ result: "deleted" }); });
  app.patch("/api/carousels/:id/slides/:slideId", async c => {
    const fields = await parseJson(c, z.object({ texts: CarouselTexts.optional(), logo: CarouselLogo.optional(), brightness: z.number().min(0.2).max(2).optional(), shade: z.number().min(0).max(0.9).optional(), sceneNumber: z.number().int().positive().optional(), imagePrompt: z.string().max(4000).optional(), background: z.object({ mode: z.enum(["ai", "frame"]).optional(), sec: z.number().min(0).optional(), cropY: z.number().min(0).max(1).optional(), highlight: z.object({ style: z.enum(["border", "dim", "zoom", "ai-outline"]).optional(), target: z.string().max(1000).optional(), box: CarouselBox.optional(), color: z.string().optional(), width: z.number().positive().max(100).optional() }).optional() }).optional() }).strict().refine(value => Object.keys(value).length > 0));
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const before = await store.requireCarousel(id); const previous = before.slides.find(slide => slide.id === slideId);
    if (fields.background?.mode && context.jobs.findActive(`carousel:${id}:${slideId}`)) throw new HttpError(409, "active-job", "이 장을 생성 중입니다");
    const updated = await store.updateSlideUserFields(id, slideId, fields);
    const slide = updated.slides.find(slide => slide.id === slideId)!;
    const modeChanged = previous?.background.kind === "frame" && slide.background.kind === "frame" && previous.background.mode !== slide.background.mode;
    if (modeChanged && updated.stage === "images" && slide.background.kind === "frame") {
      const background = slide.background;
      if (background.mode === "ai" && (!background.generated || background.generated.frameVersion !== background.frame?.version || background.generatedStatus !== "done")) {
        const job = await queueDerived(updated, slide, !background.frame);
        return c.json({ job }, 202);
      }
      await automaticBox(context, store, id, slideId);
      return c.json(await store.requireCarousel(id));
    }
    return c.json(updated);
  });

  app.patch("/api/carousels/:id", async c => {
    const input = await parseJson(c, z.object({ caption: z.string().max(2000).optional(), style: z.string().max(1000).optional() }).strict().refine(value => Object.keys(value).length > 0));
    return c.json(await store.updateCarouselFields(c.req.param("id"), input));
  });
  app.post("/api/carousels/:id/slides", async c => {
    const id = c.req.param("id"); const carousel = await store.requireCarousel(id);
    let sec: number | undefined;
    const previous = carousel.slides.at(-1);
    if (carousel.source.kind === "project" && previous?.sceneNumber) {
      const project = await context.store.requireProject(carousel.source.projectId);
      const script = await readProjectScript(context, project.id);
      const scene = script.scenes[previous.sceneNumber - 1];
      if (scene) {
        const inputId = project.inputs.filter(item => item.id !== "placeholder")[scene.inputIndex - 1]?.id;
        // sceneFrameSec maps source time to the current timeline; a zero-length scene selects its end.
        sec = sceneFrameSec(script.scenes.map((item, i) => i === previous.sceneNumber! - 1 && item.endSec !== null ? { ...item, startSec: item.endSec } : item), project.timeline, previous.sceneNumber, inputId);
      }
    }
    return c.json(await store.addSlide(id, sec));
  });
  app.delete("/api/carousels/:id/slides/:slideId", async c => c.json(await store.removeSlide(c.req.param("id"), c.req.param("slideId"))));
  app.put("/api/carousels/:id/slides/order", async c => {
    const { slideIds } = await parseJson(c, z.object({ slideIds: z.array(z.string().min(1)) }));
    return c.json(await store.reorderSlides(c.req.param("id"), slideIds));
  });
  app.post("/api/carousels/:id/logo", async c => {
    const id = c.req.param("id"); await store.requireCarousel(id);
    const settings = await context.store.readSettings();
    const brand = BrandSettings.safeParse(settings.brand);
    const watermark = brand.success ? brand.data.watermark : DEFAULT_BRAND_SETTINGS.watermark;
    if (!watermark?.file) throw new HttpError(409, "watermark-missing", "설정에 워터마크 이미지가 없습니다");
    const source = path.join(context.store.root, "brand", watermark.file);
    if (!(await stat(source).catch(() => null))?.isFile()) throw new HttpError(409, "watermark-missing", "설정의 워터마크 파일이 없습니다");
    const file = await store.copyLogo(id, source);
    return c.json({ enabled: true, x: watermark.x, y: watermark.y, width: watermark.width, opacity: watermark.opacity, file });
  });

  app.post("/api/projects/:id/carousel", async c => {
    const input = await parseJson(c, z.object({ count: z.number().int().min(2).max(10).default(5), aspect: ImageOptions.shape.aspect.optional() }));
    const project = await context.store.requireProject(c.req.param("id"));
    const plan = await planDerivedCarousel(context, project, input.count);
    const aspect = input.aspect ?? (await options(context)).aspect;
    const carousel = await store.createCarousel({
      name: `${project.name} 캐러셀`, source: { kind: "project", projectId: project.id, projectName: project.name, durationSec: timelineVideoDuration(project.timeline) },
      stage: "review", caption: plan.caption, style: plan.style, aspect,
      slides: plan.slides.map((slide, index) => ({
        ...newSlide({ kind: "project", projectId: project.id, projectName: project.name }, aspect), id: `slide-${index + 1}`,
        texts: defaultTexts(aspect).map(text => ({ ...text, text: text.role === "title" ? slide.title : slide.body })),
        sceneNumber: slide.sceneNumber, imagePrompt: slide.imagePrompt, background: { kind: "frame", mode: "ai", generatedStatus: "idle", sec: slide.sec, cropY: 0.5, status: "idle", highlight: { style: "border", target: slide.target } },
      })),
    });
    return c.json({ carousel, ...(plan.message ? { message: plan.message } : {}) }, 201);
  });

  app.post("/api/carousels/:id/slides/:slideId/frame", async c => {
    const input = await parseJson(c, z.object({ sec: z.number().min(0), cropY: z.number().min(0).max(1) }));
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
    if (!slide || slide.background.kind !== "frame" || carousel.source.kind !== "project") throw new HttpError(400, "not-derived", "영상 파생 캐러셀의 frame 장이 아닙니다");
    if (context.jobs.findActive(`carousel:${id}:${slideId}`)) throw new HttpError(409, "active-job", "이 장을 생성 중입니다");
    if (!(await context.store.getProject(carousel.source.projectId))) throw new HttpError(409, "source-project-missing", "원본 프로젝트가 없어 프레임을 다시 뽑을 수 없습니다");
    const updated = await store.updateSlideUserFields(id, slideId, { background: input });
    if (slide.background.mode === "ai") {
      const job = await queueDerived(updated, updated.slides.find(item => item.id === slideId)!, true);
      return c.json({ job }, 202);
    }
    await store.clearBackgroundHighlight(id, slideId);
    await extractSlideFrame(context, store, id, slideId);
    return c.json(await store.requireCarousel(id));
  });

  app.post("/api/carousels/:id/slides/:slideId/regenerate", async c => {
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
    if (carousel.stage !== "images" || carousel.source.kind !== "project" || slide?.background.kind !== "frame" || slide.background.mode !== "ai") throw new HttpError(409, "not-ai", "AI 이미지 장이 아닙니다");
    if (!slide.background.frame) throw new HttpError(409, "frame-missing", "참고 프레임이 없습니다");
    return c.json({ job: await queueDerived(carousel, slide, false) }, 202);
  });

  app.post("/api/carousels/:id/slides/:slideId/highlight", async c => {
    const input = await parseJson(c, z.object({ style: z.enum(["none", "border", "dim", "zoom", "ai-outline"]), target: z.string().max(1000), box: z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) }).optional(), color: z.string().optional(), width: z.number().positive().max(100).optional() }));
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
    if (!slide || slide.background.kind !== "frame") throw new HttpError(400, "not-frame", "frame 배경 장이 아닙니다");
    const background = slide.background;
    const visible = visibleBackground(slide);
    await store.updateSlideUserFields(id, slideId, { background: { highlight: { style: input.style, target: input.target, ...(input.box ? { box: input.box } : {}), ...(input.color ? { color: input.color } : {}), ...(input.width ? { width: input.width } : {}) } } });
    if (input.style === "none") return c.json(await store.requireCarousel(id));
    if (input.box) await store.clearAutomaticHighlight(id, slideId, false);
    else if (input.style !== "ai-outline") {
      const settings = await context.store.readSettings();
      const apiKey = await context.jevKey();
      const enabled = settings.jevEnabled !== false && !!apiKey;
      if (enabled && visible.file) {
        const imagePath = path.join(store.carouselDir(id), visible.file);
        const result = context.carouselServices?.askBox
          ? await context.carouselServices.askBox({ imagePath, target: plainCaptionText(input.target), enabled })
          : await askJevBox({ imagePath, target: plainCaptionText(input.target), apiKey: apiKey ?? undefined, enabled });
        await recordProviderUsage(context.store.root, "jev", result.usage, carousel.source.kind === "project" ? carousel.source.projectId : id);
        await store.updateSlideEngineFields(id, slideId, { background: { highlight: { ...(background.highlight ?? { style: input.style, target: input.target }), box: result.box ?? undefined } } });
      } else await store.clearAutomaticHighlight(id, slideId, true);
      return c.json(await store.requireCarousel(id));
    }
    if (input.style !== "ai-outline") return c.json(await store.requireCarousel(id));
    if (!visible.file) throw new HttpError(400, "frame-missing", "AI 윤곽에 쓸 프레임이 없습니다");
    const referenceFrame = visible.file;
    const imageOptions = await options(context); queue.setConcurrency(imageOptions.concurrency);
    const job = context.jobs.startImage({ projectId: id, sceneIndex: carousel.slides.indexOf(slide), label: `${carousel.name} · AI 윤곽`, key: `carousel:${id}:${slideId}`, queued: true, cancellable: true }, async jobContext => {
      const output = path.join(store.carouselDir(id), "images", `${slideId}-outline-working.png`);
      await store.updateSlideEngineFields(id, slideId, backgroundStatus(slide, "running"));
      try {
        const imageInput = { quality: imageOptions.quality, aspect: carousel.aspect, prompt: "", style: "", referenceImage: path.join(store.carouselDir(id), referenceFrame), instruction: `원본의 사람·상품·글자를 그대로 두고 ${input.target}에만 흰 윤곽 테두리를 추가한다.`, output, signal: jobContext.signal };
        let message: string | undefined;
        const generated = context.carouselServices
          ? await context.carouselServices.generateImage({ ...imageInput, model: imageOptions.model })
          : await runCarouselImage(context, { ...imageInput, imageModel: imageOptions.model }).then(attempt => { message = codexModelSwitchMessage(attempt); return attempt.value; });
        jobContext.signal.throwIfAborted();
        const saved = await store.saveHighlightImageVersion(id, slideId, Buffer.isBuffer(generated) ? generated : await readFile(generated.output));
        if (!Buffer.isBuffer(generated)) {
          await rm(generated.output, { force: true });
          await recordCodexUsage(context.store.root, generated.usage, carousel.source.kind === "project" ? carousel.source.projectId : id);
        }
        return { kind: "done", result: saved.slides.find(item => item.id === slideId)?.background, ...(message ? { message } : {}) };
      } catch (error) {
        await rm(output, { force: true });
        await store.updateSlideEngineFields(id, slideId, backgroundStatus(slide, "failed", error instanceof Error ? error.message : String(error))).catch(() => undefined);
        throw error;
      }
    }, queue.queue);
    return c.json({ job }, 202);
  });

  app.post("/api/carousels/refine", async c => {
    const input = await parseJson(c, z.object({ topic: z.string().trim().min(1).max(1000) }));
    let message: string | undefined;
    let result: { candidates: Array<{ topic: string; angle: string }>; usage: Record<string, number> };
    if (context.carouselServices) result = await context.carouselServices.refine(input);
    else {
      const selection = await codexRunnerOptions(context);
      const attempt = await withCodexModelFallback(context, model => codexCliRunner({ ...selection, model }).run({ schema: RefineSchema, prompt: `사용자 주제에 맞는 캐러셀 기획 후보를 정확히 3개 제안하세요. 각 후보는 고친 주제와 한 줄 각도를 포함합니다.\n주제: ${input.topic}` }));
      result = { ...attempt.value.output, usage: attempt.value.usage };
      message = codexModelSwitchMessage(attempt);
    }
    const parsed = RefineSchema.parse({ candidates: result.candidates }); await recordCodexUsage(context.store.root, result.usage, null);
    return c.json({ ...parsed, ...(message ? { message } : {}) });
  });

  app.post("/api/carousels/:id/plan", async c => {
    const id = c.req.param("id"); const carousel = await store.requireCarousel(id);
    const input = await parseJson(c, z.object({ topic: z.string().trim().min(1).max(1000).optional() }));
    if (context.jobs.hasActiveForProject(id)) throw new HttpError(409, "active-job", "생성 중에는 기획을 바꿀 수 없습니다");
    const count = carousel.slides.length;
    if (carousel.source.kind === "project") {
      const project = await context.store.requireProject(carousel.source.projectId);
      const plan = await planDerivedCarousel(context, project, count);
      return c.json({ ...await store.replacePlan(id, plan), ...(plan.message ? { message: plan.message } : {}) }, 202);
    }
    const topic = input.topic ?? carousel.topic ?? "";
    let message: string | undefined;
    let result: Awaited<ReturnType<NonNullable<AppContext["carouselServices"]>["plan"]>>;
    if (context.carouselServices) result = await context.carouselServices.plan({ topic, count, ...(carousel.style === undefined ? {} : { style: carousel.style }) });
    else {
      const selection = await codexRunnerOptions(context);
      const settings = await context.store.readSettings();
      const prompt = carouselTopicPrompt({ basePrompt: resolveCarouselPrompt(settings.carouselTopicPrompt, (await context.promptDefaults!()).carouselTopic), count, topic, style: carousel.style });
      const attempt = await withCodexModelFallback(context, model => codexCliRunner({ ...selection, model }).run({ schema: PlanSchema, prompt }));
      result = { ...attempt.value.output, usage: attempt.value.usage };
      message = codexModelSwitchMessage(attempt);
    }
    const parsed = PlanSchema.safeParse(result);
    if (!parsed.success || parsed.data.slides.length !== count) throw new HttpError(502, "invalid-plan", "Codex 기획 결과가 요청한 장 수와 맞지 않습니다");
    const updated = await store.replacePlan(id, { topic: result.topic ?? topic, ...parsed.data });
    await recordCodexUsage(context.store.root, result.usage, id);
    return c.json({ ...updated, ...(message ? { message } : {}) }, 202);
  });

  app.post("/api/carousels/:id/generate", async c => {
    const id = c.req.param("id"); const input = await parseJson(c, z.object({ slideIds: z.array(z.string().min(1)).optional() }));
    const carousel = await store.requireCarousel(id); const imageOptions = await options(context);
    queue.setConcurrency(imageOptions.concurrency);
    const selected = carousel.slides.filter(slide => !input.slideIds || input.slideIds.includes(slide.id));
    if (input.slideIds?.some(slideId => !carousel.slides.some(slide => slide.id === slideId))) throw new HttpError(404, "slide-not-found", "장이 없습니다");
    await store.setStage(id, "images");
    if (carousel.source.kind === "project") {
      const jobs = [];
      for (const slide of selected) jobs.push(await queueDerived(carousel, slide, true));
      return c.json({ jobs }, 202);
    }
    const ready = selected.filter(slide => slide.imagePrompt.trim());
    await Promise.all(selected.filter(slide => !slide.imagePrompt.trim()).map(slide => store.updateSlideEngineFields(id, slide.id, { status: "failed", error: "지시문 없음" })));
    await Promise.all(ready.filter(slide => !context.jobs.findActive(`carousel:${id}:${slide.id}`)).map(slide => store.updateSlideEngineFields(id, slide.id, { status: "queued" })));
    const jobs = ready.map(slide => context.jobs.startImage({ projectId: id, sceneIndex: carousel.slides.indexOf(slide), label: `${carousel.name} · ${slide.texts[0]?.text || slide.id}`, key: `carousel:${id}:${slide.id}`, queued: true, cancellable: true }, async jobContext => {
      await store.updateSlideEngineFields(id, slide.id, { status: "running", error: undefined }); jobContext.progress(0.05, "이미지 생성 중");
      try {
        const output = path.join(store.carouselDir(id), "images", `${slide.id}-working.png`);
        let message: string | undefined;
        const generated = context.carouselServices
          ? await context.carouselServices.generateImage({ prompt: slide.imagePrompt ?? "", style: carousel.style ?? "", model: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, output, signal: jobContext.signal })
          : await runCarouselImage(context, { imageModel: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, prompt: slide.imagePrompt ?? "", style: carousel.style ?? "", output, signal: jobContext.signal }).then(attempt => { message = codexModelSwitchMessage(attempt); return attempt.value; });
        jobContext.signal.throwIfAborted();
        const file = Buffer.isBuffer(generated) ? generated : await readFile(generated.output);
        const saved = await store.saveImageVersion(id, slide.id, file);
        if (!Buffer.isBuffer(generated)) await rm(generated.output, { force: true });
        if (!Buffer.isBuffer(generated)) await recordCodexUsage(context.store.root, generated.usage, id);
        jobContext.progress(1, "이미지 생성 완료");
        return { kind: "done" as const, result: saved.slides.find(item => item.id === slide.id)?.image, ...(message ? { message } : {}) };
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
    await queue.onIdle();
    await Promise.all(active.flatMap(job => {
      const prefix = `carousel:${id}:`;
      const slide = job.key?.startsWith(prefix) ? carousel.slides.find(slide => slide.id === job.key!.slice(prefix.length)) : undefined;
      return slide && ["queued", "running"].includes(visibleBackground(slide).status)
        ? [store.updateSlideEngineFields(id, slide.id, backgroundStatus(slide, "failed", "취소했습니다"))] : [];
    }));
    return c.json({ results });
  });
  app.post("/api/carousels/:id/download", async c => {
    const id = c.req.param("id"); const { dir } = await parseJson(c, z.object({ dir: z.string().min(1) }));
    const carousel = await store.requireCarousel(id);
    const done = carousel.slides.filter(slide => { const visible = visibleBackground(slide); return !!visible.file && visible.status === "done"; });
    if (done.length === 0) return c.json({ message: "받을 수 있는 완료된 장이 없습니다" }, 409);
    if (!context.composeCarouselSlide) throw new HttpError(503, "composer-unavailable", "최종 이미지 합성은 CarouselSlide 구현 뒤 사용할 수 있습니다");
    const targetRoot = path.resolve(dir); await mkdir(targetRoot, { recursive: true });
    const existing = await readdir(targetRoot); const folder = nextCarouselFolderName(carouselFolderName(carousel.name), existing);
    const destination = path.join(targetRoot, folder); await mkdir(destination);
    for (const [index, slide] of done.entries()) await context.composeCarouselSlide(carousel, slide, path.join(destination, receivedSlideFileName(index)));
    await writeFile(path.join(destination, "caption.txt"), carousel.caption, "utf8");
    return c.json({ directory: destination, files: [...done.map((_, index) => receivedSlideFileName(index)), "caption.txt"] });
  });
  app.get("/api/carousels/:id/files/*", async c => {
    const carousel = await store.requireCarousel(c.req.param("id"));
    const relative = decodeURIComponent(c.req.path.slice(`/api/carousels/${carousel.id}/files/`.length));
    if (!relative || relative.includes("\0") || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new HttpError(403, "forbidden", "캐러셀 밖의 파일을 읽을 수 없습니다");
    const root = path.resolve(store.carouselDir(carousel.id)); const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new HttpError(403, "forbidden", "캐러셀 밖의 파일을 읽을 수 없습니다");
    const info = await stat(file).catch(() => null); if (!info?.isFile()) throw new HttpError(404, "not-found", "파일이 없습니다");
    return new Response(await readFile(file), { headers: { "content-type": ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" } });
  });
}

async function codexRunnerOptions(context: AppContext) {
  const { bin, effort } = await codexSelection(context);
  if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
  return { bin, effort };
}

async function runCarouselImage(context: AppContext, options: Omit<CodexImageOptions, "bin" | "model" | "effort">) {
  const selection = await codexRunnerOptions(context);
  return withCodexModelFallback(context, model => runCodexImage({ ...selection, ...options, model }));
}

async function readProjectScript(context: AppContext, id: string) {
  const raw = await readFile(path.join(context.store.projectDir(id), "script.json"), "utf8").catch(() => {
    throw new HttpError(400, "missing-script", "원본 프로젝트에 대본이 없습니다");
  });
  const parsed = CodexScript.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new HttpError(400, "invalid-script", "원본 프로젝트 대본 형식이 맞지 않습니다");
  return parsed.data;
}

async function planDerivedCarousel(context: AppContext, project: import("../../core/schema").Project, count: number) {
  const script = await readProjectScript(context, project.id);
  const sourceInputs = project.inputs.filter(item => item.id !== "placeholder");
  const videoOne = sourceInputs.find(item => item.kind === "video");
  if (!videoOne || !project.timeline.video.some(item => item.kind === "main" && item.inputId === videoOne.id)) throw new HttpError(400, "missing-video", "영상 1 본 화면 클립이 없습니다");
  const material = {
    scenes: script.scenes.map((scene, index) => ({ sceneNumber: index + 1, caption: plainCaptionText(scene.caption) })),
    captionLayersMain: captionLayersOf(project.timeline).flatMap(layer => layer.main.map(clip => plainCaptionText(clip.text)).filter(Boolean)),
    title: project.timeline.brand?.titleBar?.text ?? script.title ?? "", videoDurationSec: videoOne.durationSec ?? timelineVideoDuration(project.timeline),
  };
  const settings = await context.store.readSettings();
  const prompt = carouselVideoPrompt({ basePrompt: resolveCarouselPrompt(settings.carouselVideoPrompt, (await context.promptDefaults!()).carouselVideo), count, material });
  let message: string | undefined;
  let result: Awaited<ReturnType<NonNullable<NonNullable<AppContext["carouselServices"]>["derivePlan"]>>>;
  if (context.carouselServices?.derivePlan) result = await context.carouselServices.derivePlan({ projectId: project.id, count, prompt });
  else {
    const selection = await codexRunnerOptions(context);
    const attempt = await withCodexModelFallback(context, model => codexCliRunner({ ...selection, model }).run({ schema: DerivedPlanSchema, prompt }));
    result = { ...attempt.value.output, usage: attempt.value.usage };
    message = codexModelSwitchMessage(attempt);
  }
  const parsed = DerivedPlanSchema.safeParse(result);
  if (!parsed.success || parsed.data.slides.length !== count || parsed.data.slides.some(slide => slide.sceneNumber > script.scenes.length)) throw new HttpError(502, "invalid-plan", "Codex 파생 기획 결과의 장 수나 대본 장면 번호가 맞지 않습니다");
  await recordCodexUsage(context.store.root, result.usage, project.id);
  return { message, caption: parsed.data.caption, style: parsed.data.style, slides: parsed.data.slides.map(slide => ({
    ...slide, sec: sceneFrameSec(script.scenes, project.timeline, slide.sceneNumber, sourceInputs[script.scenes[slide.sceneNumber - 1]!.inputIndex - 1]?.id),
  })) };
}

async function extractSlideFrame(context: AppContext, store: CarouselStore, id: string, slideId: string, signal?: AbortSignal): Promise<void> {
  const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
  if (carousel.source.kind !== "project" || slide?.background.kind !== "frame") throw new HttpError(400, "not-derived", "영상 파생 장이 아닙니다");
  const project = await context.store.getProject(carousel.source.projectId);
  if (!project) {
    await store.updateSlideEngineFields(id, slideId, { background: { status: "failed", error: "원본 프로젝트가 없습니다" } });
    throw new HttpError(409, "source-project-missing", "원본 프로젝트가 없어 프레임을 다시 뽑을 수 없습니다");
  }
  const outputPath = path.join(store.carouselDir(id), "frames", `${slideId}-working.png`);
  await store.updateSlideEngineFields(id, slideId, { background: { status: "running", error: undefined } });
  try {
    signal?.throwIfAborted(); await mkdir(path.dirname(outputPath), { recursive: true });
    if (context.carouselServices?.renderFrame) await context.carouselServices.renderFrame({ project, sec: slide.background.sec, outputPath });
    else await renderProjectFrame(context, project, slide.background.sec, outputPath);
    signal?.throwIfAborted();
    const saved = await store.saveFrameVersion(id, slideId, await readFile(outputPath));
    const fresh = saved.slides.find(item => item.id === slideId)!;
    if (fresh.background.kind !== "frame") throw new Error("프레임 배경이 아닙니다");
    if (fresh.background.mode !== "ai") await automaticBox(context, store, id, slideId, signal);
  } catch (error) {
    await store.updateSlideEngineFields(id, slideId, { background: { status: "failed", error: signal?.aborted ? "취소했습니다" : error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
    throw error;
  } finally {
    await rm(outputPath, { force: true });
  }
}

async function automaticBox(context: AppContext, store: CarouselStore, id: string, slideId: string, signal?: AbortSignal): Promise<void> {
  const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId)!;
  if (slide.background.kind !== "frame") return;
  const highlight = slide.background.highlight;
  const visible = visibleBackground(slide);
  const settings = await context.store.readSettings(); const apiKey = await context.jevKey();
  const enabled = settings.jevEnabled !== false && !!apiKey;
  if (enabled && visible.file && !highlight?.boxManual && highlight && highlight.style !== "none") {
    const imagePath = path.join(store.carouselDir(id), visible.file), target = plainCaptionText(highlight.target);
    const result = context.carouselServices?.askBox
      ? await context.carouselServices.askBox({ imagePath, target, enabled })
      : await askJevBox({ imagePath, target, apiKey: apiKey ?? undefined, enabled });
    signal?.throwIfAborted();
    await recordProviderUsage(context.store.root, "jev", result.usage, carousel.source.kind === "project" ? carousel.source.projectId : id);
    await store.updateSlideEngineFields(id, slideId, { background: { highlight: { box: result.box ?? undefined } } });
  } else if (!enabled) await store.clearAutomaticHighlight(id, slideId, true);
}
