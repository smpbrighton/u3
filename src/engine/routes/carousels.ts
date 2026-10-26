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
import { Carousel, CarouselBox, carouselFolderName, nextCarouselFolderName, receivedSlideFileName } from "../../core/carousel";
import { CodexScript, captionLayersOf } from "../../core/schema";
import { sceneFrameSec } from "../../core/carousel-frame";
import { renderCarouselFrame } from "../pipeline/carousel-frame";
import { askJevBox } from "../pipeline/jev-box";

const RefineSchema = z.object({ candidates: z.array(z.object({ topic: z.string().min(1), angle: z.string().min(1) })).length(3) });
const PlanSchema = z.object({ style: z.string().min(1), slides: z.array(z.object({ title: z.string(), body: z.string(), imagePrompt: z.string().min(1) })) });
const DerivedPlanSchema = z.object({ slides: z.array(z.object({ sceneNumber: z.number().int().positive(), title: z.string(), body: z.string(), target: z.string().min(1) })) });
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
async function recordProviderUsage(root: string, provider: string, usage: Record<string, number>, projectId: string): Promise<void> {
  const entries = Object.entries(usage).filter(([, amount]) => Number.isFinite(amount) && amount >= 0).map(([unit, amount]) => makeUsageEntry({ provider: "jev", unit, amount, projectId }));
  await fileUsageLog(root).append(entries);
}

function carouselSlideImage(slide: import("../../core/carousel").CarouselSlide): { file: string } | undefined {
  if (slide.background.kind === "generated") return slide.background.image ?? slide.image;
  return slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame;
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
    const fields = await parseJson(c, z.object({ title: z.string().max(500).optional(), body: z.string().max(5000).optional(), textPlacement: z.enum(["top", "center", "bottom"]).optional(), imagePrompt: z.string().max(4000).optional(), background: z.object({ sec: z.number().min(0).optional(), cropY: z.number().min(0).max(1).optional(), highlight: z.object({ style: z.enum(["border", "dim", "zoom", "ai-outline"]).optional(), target: z.string().max(1000).optional(), box: CarouselBox.optional(), color: z.string().optional(), width: z.number().positive().max(100).optional() }).optional() }).optional() }).refine(value => Object.keys(value).length > 0));
    return c.json(await store.updateSlideUserFields(c.req.param("id"), c.req.param("slideId"), fields));
  });

  app.post("/api/projects/:id/carousel", async c => {
    const input = await parseJson(c, z.object({ count: z.number().int().min(2).max(10).default(5), aspect: z.enum(["4:5", "1:1"]).optional() }));
    const project = await context.store.requireProject(c.req.param("id"));
    const rawScript = JSON.parse(await readFile(path.join(context.store.projectDir(project.id), "script.json"), "utf8"));
    const script = CodexScript.parse(rawScript);
    const sourceInputs = project.inputs.filter(item => item.id !== "placeholder");
    const videoOne = sourceInputs.filter(item => item.kind === "video")[0];
    if (!videoOne || !project.timeline.video.some(item => item.kind === "main" && item.inputId === videoOne.id)) throw new HttpError(400, "missing-video", "영상 1 본 화면 클립이 없습니다");
    const imageOptions = await options(context); const aspect = input.aspect ?? imageOptions.aspect;
    const settings = await context.store.readSettings(); const bin = await context.codexPath();
    const captionText = captionLayersOf(project.timeline).map(layer => layer.main.map(clip => clip.text).filter(Boolean)).flat();
    const videoDuration = videoOne.durationSec ?? Math.max(...project.timeline.video.map(item => {
      if (item.kind !== "main" || item.inputId !== videoOne.id) return 0;
      return "durationSec" in item ? item.durationSec : item.inEndSec - item.inStartSec;
    }));
    const material = {
      scenes: script.scenes.map((scene, index) => ({ sceneNumber: index + 1, caption: scene.caption })),
      captionLayersMain: captionText,
      title: project.timeline.brand?.titleBar?.text ?? script.title ?? "",
      videoDurationSec: videoDuration,
    };
    const prompt = `영상 프로젝트의 내용을 바탕으로 정확히 ${input.count}장의 파생 캐러셀을 기획하세요. 입력 장면에서 장면 번호를 고르고, 제목·본문·강조 대상을 작성하세요. 프레임 이미지는 입력하지 않았으므로 화면을 단정하지 말고 장면 자막에서 찾을 수 있는 짧은 대상 문장을 쓰세요. JSON 형식은 {"slides":[{"sceneNumber":1,"title":"...","body":"...","target":"..."}]} 입니다.\n자료: ${JSON.stringify(material)}`;
    let plan: { slides: Array<{ sceneNumber: number; title: string; body: string; target: string }>; usage: Record<string, number> };
    if (context.carouselServices?.derivePlan) plan = await context.carouselServices.derivePlan({ projectId: project.id, count: input.count, prompt });
    else {
      if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
      const result = await codexCliRunner({ bin, model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium") }).run({ schema: DerivedPlanSchema, prompt });
      plan = { ...result.output, usage: result.usage };
    }
    const parsed = DerivedPlanSchema.safeParse({ slides: plan.slides });
    if (!parsed.success || parsed.data.slides.length !== input.count || parsed.data.slides.some(slide => slide.sceneNumber > script.scenes.length)) throw new HttpError(502, "invalid-plan", "Codex 파생 기획 결과가 요청한 장 수나 대본 장면 번호와 맞지 않습니다");
    await recordCodexUsage(context.store.root, plan.usage, project.id);
    const carousel = await store.createCarousel({ name: `${project.name} 캐러셀`, source: { kind: "project", projectId: project.id, projectName: project.name }, aspect, slides: parsed.data.slides.map((slide, index) => ({ id: `slide-${index + 1}`, sceneNumber: slide.sceneNumber, title: slide.title, body: slide.body, textPlacement: "bottom", background: { kind: "frame", sec: sceneFrameSec(script.scenes, project.timeline, slide.sceneNumber, sourceInputs[script.scenes[slide.sceneNumber - 1]?.inputIndex! - 1]?.id), cropY: 0.5, status: "queued", highlight: { style: "border", target: slide.target } } })) });
    const job = context.jobs.start({ kind: "image", projectId: carousel.id, label: `${carousel.name} 파생 프레임`, key: `carousel-derived:${carousel.id}`, cancellable: true }, async jobContext => {
      const currentProject = await context.store.requireProject(project.id);
      for (const slide of carousel.slides) {
        if (jobContext.signal.aborted) throw new Error("프레임 추출을 취소했습니다");
        const background = slide.background;
        if (background.kind !== "frame") continue;
        await store.updateSlideEngineFields(carousel.id, slide.id, { background: { status: "running", error: undefined } });
        const outputPath = path.join(store.carouselDir(carousel.id), "frames", `${slide.id}-working.png`);
        try {
          if (context.carouselServices?.renderFrame) await context.carouselServices.renderFrame({ project: currentProject, sec: background.sec, outputPath });
          else await renderProjectFrame(context, currentProject, background.sec, outputPath);
          const png = await readFile(outputPath); const saved = await store.saveFrameVersion(carousel.id, slide.id, png); await rm(outputPath, { force: true });
          const savedSlide = saved.slides.find(item => item.id === slide.id)!;
          const savedBackground = savedSlide.background.kind === "frame" ? savedSlide.background : undefined;
          const enabled = settings.jevEnabled !== false && context.jevAvailable;
          if (!savedBackground?.frame?.file) throw new Error("저장된 프레임 파일을 찾을 수 없습니다");
          const boxResult = enabled
            ? context.carouselServices?.askBox
              ? await context.carouselServices.askBox({ imagePath: path.join(store.carouselDir(carousel.id), savedBackground.frame.file), target: background.highlight?.target ?? "", enabled })
              : await askJevBox({ imagePath: path.join(store.carouselDir(carousel.id), savedBackground.frame.file), target: background.highlight?.target ?? "", apiKey: process.env.TYPESAFE_API_KEY, enabled })
            : { box: null, confidence: null, usage: { input_tokens: 0, output_tokens: 0 }, model: "jev-1.14.0" };
          if (enabled && boxResult.usage.input_tokens + boxResult.usage.output_tokens > 0) await recordProviderUsage(context.store.root, "jev", boxResult.usage, project.id);
          await store.updateSlideEngineFields(carousel.id, slide.id, { background: { highlight: { box: boxResult.box ?? undefined } } });
        } catch (error) {
          await store.updateSlideEngineFields(carousel.id, slide.id, { background: { status: "failed", error: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
          throw error;
        }
        jobContext.progress((carousel.slides.indexOf(slide) + 1) / carousel.slides.length, `${carousel.slides.indexOf(slide) + 1}/${carousel.slides.length}장 프레임 완료`);
      }
      return { kind: "done", result: { carouselId: carousel.id } };
    });
    return c.json({ carousel, job }, 202);
  });

  app.post("/api/carousels/:id/slides/:slideId/frame", async c => {
    const input = await parseJson(c, z.object({ sec: z.number().min(0), cropY: z.number().min(0).max(1) }));
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
    if (!slide || slide.background.kind !== "frame" || carousel.source.kind !== "project") throw new HttpError(400, "not-derived", "영상 파생 캐러셀의 frame 장이 아닙니다");
    const project = await context.store.getProject(carousel.source.projectId);
    if (!project) throw new HttpError(409, "source-project-missing", "원본 프로젝트가 없어 프레임을 다시 뽑을 수 없습니다");
    const nextBackground = { ...slide.background, sec: input.sec, cropY: input.cropY };
    await store.updateSlideUserFields(id, slideId, { background: { sec: input.sec, cropY: input.cropY } });
    await store.updateSlideEngineFields(id, slideId, { background: { status: "running", error: undefined } });
    const output = path.join(store.carouselDir(id), "frames", `${slideId}-working.png`);
    try {
      if (context.carouselServices?.renderFrame) await context.carouselServices.renderFrame({ project, sec: input.sec, outputPath: output });
      else await renderProjectFrame(context, project, input.sec, output);
      const updated = await store.saveFrameVersion(id, slideId, await readFile(output)); await rm(output, { force: true });
      const settings = await context.store.readSettings();
      const enabled = settings.jevEnabled !== false && context.jevAvailable;
      const fresh = updated.slides.find(item => item.id === slideId)!;
      const freshBackground = fresh.background.kind === "frame" ? fresh.background : undefined;
      const frameFile = freshBackground?.frame?.file;
      if (frameFile && !freshBackground?.highlight?.boxManual) {
        const imagePath = path.join(store.carouselDir(id), frameFile);
        const result = context.carouselServices?.askBox
          ? await context.carouselServices.askBox({ imagePath, target: nextBackground.highlight?.target ?? "", enabled })
          : await askJevBox({ imagePath, target: nextBackground.highlight?.target ?? "", apiKey: process.env.TYPESAFE_API_KEY, enabled });
        if (enabled) await recordProviderUsage(context.store.root, "jev", result.usage, project.id);
        await store.updateSlideEngineFields(id, slideId, { background: { highlight: { ...(freshBackground.highlight ?? { style: "border", target: "" }), box: result.box ?? undefined } } });
      } else if (!enabled) await store.clearAutomaticHighlight(id, slideId, true);
      return c.json(await store.requireCarousel(id));
    } catch (error) {
      await rm(output, { force: true });
      await store.updateSlideEngineFields(id, slideId, { background: { status: "failed", error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  });

  app.post("/api/carousels/:id/slides/:slideId/highlight", async c => {
    const input = await parseJson(c, z.object({ style: z.enum(["border", "dim", "zoom", "ai-outline"]), target: z.string().max(1000), box: z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) }).optional(), color: z.string().optional(), width: z.number().positive().max(100).optional() }));
    const id = c.req.param("id"), slideId = c.req.param("slideId");
    const carousel = await store.requireCarousel(id); const slide = carousel.slides.find(item => item.id === slideId);
    if (!slide || slide.background.kind !== "frame") throw new HttpError(400, "not-frame", "frame 배경 장이 아닙니다");
    const background = slide.background;
    await store.updateSlideUserFields(id, slideId, { background: { highlight: { style: input.style, target: input.target, ...(input.box ? { box: input.box } : {}), ...(input.color ? { color: input.color } : {}), ...(input.width ? { width: input.width } : {}) } } });
    if (input.box) await store.clearAutomaticHighlight(id, slideId, false);
    else if (input.style !== "ai-outline") {
      const settings = await context.store.readSettings();
      const enabled = settings.jevEnabled !== false && context.jevAvailable;
      if (enabled && background.frame?.file) {
        const imagePath = path.join(store.carouselDir(id), background.frame.file);
        const result = context.carouselServices?.askBox
          ? await context.carouselServices.askBox({ imagePath, target: input.target, enabled })
          : await askJevBox({ imagePath, target: input.target, apiKey: process.env.TYPESAFE_API_KEY, enabled });
        await recordProviderUsage(context.store.root, "jev", result.usage, carousel.source.kind === "project" ? carousel.source.projectId : id);
        await store.updateSlideEngineFields(id, slideId, { background: { highlight: { ...(background.highlight ?? { style: input.style, target: input.target }), box: result.box ?? undefined } } });
      } else await store.clearAutomaticHighlight(id, slideId, true);
      return c.json(await store.requireCarousel(id));
    }
    if (input.style !== "ai-outline") return c.json(await store.requireCarousel(id));
    if (!background.frame?.file) throw new HttpError(400, "frame-missing", "AI 윤곽에 쓸 프레임이 없습니다");
    const referenceFrame = background.frame.file;
    const imageOptions = await options(context); queue.setConcurrency(imageOptions.concurrency);
    const job = context.jobs.startImage({ projectId: id, sceneIndex: carousel.slides.indexOf(slide), label: `${carousel.name} · AI 윤곽`, key: `carousel:${id}:${slideId}`, queued: true, cancellable: true }, async jobContext => {
      const output = path.join(store.carouselDir(id), "images", `${slideId}-outline-working.png`);
      await store.updateSlideEngineFields(id, slideId, { background: { status: "running", error: undefined } });
      try {
        const settings = await context.store.readSettings();
        const generated = await runCodexImage({ bin: (await context.codexPath()) ?? (() => { throw new Error("Codex CLI를 찾지 못했습니다"); })(), model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium"), imageModel: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, prompt: "", style: "", referenceImage: path.join(store.carouselDir(id), referenceFrame), instruction: `원본의 사람·상품·글자를 그대로 두고 ${input.target}에만 흰 윤곽 테두리를 추가한다.`, output, signal: jobContext.signal });
        const saved = await store.saveHighlightImageVersion(id, slideId, await readFile(generated.output)); await rm(generated.output, { force: true });
        await recordCodexUsage(context.store.root, generated.usage, carousel.source.kind === "project" ? carousel.source.projectId : id);
        return { kind: "done", result: saved.slides.find(item => item.id === slideId)?.background };
      } catch (error) {
        await rm(output, { force: true });
        await store.updateSlideEngineFields(id, slideId, { background: { status: "failed", error: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
        throw error;
      }
    }, queue.queue);
    return c.json({ job }, 202);
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
    if (carousel.source.kind !== "topic") throw new HttpError(400, "wrong-source", "주제 캐러셀에만 단독 기획을 적용할 수 있습니다");
    const topic = input.topic ?? carousel.topic ?? ""; const count = carousel.slides.length;
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
    if (carousel.source.kind !== "topic") throw new HttpError(400, "wrong-source", "주제 캐러셀에만 그림 생성을 적용할 수 있습니다");
    if (selected.some(slide => !slide.imagePrompt?.trim())) throw new HttpError(400, "missing-plan", "이미지 지시문이 없는 장이 있습니다");
    await Promise.all(selected.map(slide => store.updateSlideEngineFields(id, slide.id, { status: "queued", error: undefined })));
    const jobs = selected.map(slide => context.jobs.startImage({ projectId: id, sceneIndex: carousel.slides.findIndex(item => item.id === slide.id), label: `${carousel.name} · ${slide.title || slide.id}`, key: `carousel:${id}:${slide.id}`, queued: true, cancellable: true }, async jobContext => {
      await store.updateSlideEngineFields(id, slide.id, { status: "running", error: undefined }); jobContext.progress(0.05, "이미지 생성 중");
      try {
        const output = path.join(store.carouselDir(id), "images", `${slide.id}-working.png`);
        const settings = await context.store.readSettings();
        const generated = context.carouselServices
          ? await context.carouselServices.generateImage({ prompt: slide.imagePrompt ?? "", style: carousel.style ?? "", model: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, output, signal: jobContext.signal })
          : await runCodexImage({ bin: (await context.codexPath()) ?? (() => { throw new Error("Codex CLI를 찾지 못했습니다"); })(), model: stringSetting(settings.codexModel, "gpt-6-luna"), effort: stringSetting(settings.codexEffort, "medium"), imageModel: imageOptions.model, quality: imageOptions.quality, aspect: carousel.aspect, prompt: slide.imagePrompt ?? "", style: carousel.style ?? "", output, signal: jobContext.signal });
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
    const done = carousel.slides.filter(slide => slide.background.kind === "generated"
      ? !!(slide.background.image ?? slide.image) && slide.status === "done"
      : !!carouselSlideImage(slide) && slide.background.status === "done");
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
