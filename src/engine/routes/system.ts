import type { Hono } from "hono";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { z } from "zod";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { codexLoginStatus } from "../pipeline/codex-path";
import { readUsage } from "../pipeline/usage";
import { DEFAULT_SCRIPT_PROMPT, SCRIPT_PROMPT_MAX_LENGTH } from "../../core/script-prompt";
import { DEFAULT_SCRIPT_REVIEW_PROMPT } from "../../core/script-review";
import { formatScriptInputGuidePreview } from "../pipeline/script-validation";
import { ImageQueue } from "../image-queue";
import { listSfx } from "../pipeline/library";
import { createLibraryReference } from "../../core/library-reference";
import { BrandSettings, DEFAULT_BRAND_SETTINGS } from "../../core/schema";
import { validateBrandImage } from "../brand-image";

const IntroSfx = z.object({ enabled: z.boolean(), ref: z.string().min(1), atSec: z.number().min(0).max(10) });
const DEFAULT_INTRO_SFX = { enabled: true, ref: "u3-library:sfx/notify/sfx-mum36456-06c20f.mp3", atSec: 3 };
const pathRelativeLibrary = (file: string, root: string) => path.relative(path.basename(root) === "library" ? root : path.join(root, "library"), file);

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_MODELS = [{ slug: "gpt-6-luna", displayName: "GPT-6-Luna", efforts: ["low", "medium", "high"] }];
const ImageOptions = z.object({ model: z.enum(["flare", "sunburst"]), quality: z.enum(["low", "medium", "high", "auto"]), aspect: z.enum(["4:5", "1:1", "9:16", "16:9"]), concurrency: z.number().int().min(1).max(10) });
const DEFAULT_IMAGE_OPTIONS = { model: "flare" as const, quality: "auto" as const, aspect: "4:5" as const, concurrency: 3 };

type CodexCatalog = { models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown; supported_reasoning_levels?: Array<{ effort?: unknown }> }> };

// codex 최신 목록(서버에서 갱신)을 먼저 읽고, 실패하면 실행 파일에 든 목록(--bundled)을 쓴다.
// 다른 제공자 slug(anthropic/… 처럼 / 가 든 것)는 codex 설정이 붙인 경로라 뺀다(결정 0018).
async function readCodexCatalog(bin: string, args: string[]) {
  const { stdout } = await execFileAsync(bin, ["debug", "models", ...args], { timeout: 8_000, maxBuffer: 32 * 1024 * 1024 });
  const catalog = JSON.parse(stdout) as CodexCatalog;
  return catalog.models?.flatMap(model => {
    if (typeof model.slug !== "string" || model.visibility !== "list" || model.slug.includes("/")) return [];
    const efforts = model.supported_reasoning_levels?.flatMap(item => typeof item.effort === "string" ? [item.effort] : []) ?? [];
    return [{ slug: model.slug, displayName: typeof model.display_name === "string" ? model.display_name : model.slug, efforts }];
  }) ?? [];
}

async function readCodexModels(bin: string | null) {
  if (!bin) return { source: "fallback" as const, models: DEFAULT_CODEX_MODELS };
  for (const args of [[], ["--bundled"]]) {
    try {
      const models = await readCodexCatalog(bin, args);
      if (models.length) return { source: "codex-cli" as const, models };
    } catch { /* 다음 목록으로 넘어간다 */ }
  }
  return { source: "fallback" as const, models: DEFAULT_CODEX_MODELS };
}

export function registerSystemRoutes(app: Hono, context: AppContext): void {
  app.get("/api/system/brand", async c => {
    const settings = await context.store.readSettings();
    const parsed = BrandSettings.safeParse(settings.brand);
    return c.json(parsed.success ? parsed.data : DEFAULT_BRAND_SETTINGS);
  });

  app.put("/api/system/brand", async c => {
    const brand = await parseJson(c, BrandSettings);
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, brand });
    return c.json(brand);
  });

  app.post("/api/system/brand/watermark", async c => {
    const { path: source } = await parseJson(c, z.object({ path: z.string().trim().min(1) }));
    let image: Awaited<ReturnType<typeof validateBrandImage>>;
    try { image = await validateBrandImage(source); }
    catch (error) { throw new HttpError(400, "invalid-watermark", error instanceof Error ? error.message : "워터마크 파일을 확인할 수 없습니다"); }
    const root = path.join(context.store.root, "brand");
    const filename = `watermark${image.extension}`;
    await mkdir(root, { recursive: true });
    await copyFile(source, path.join(root, filename));
    const settings = await context.store.readSettings();
    const existing = BrandSettings.safeParse(settings.brand);
    const brand = { ...(existing.success ? existing.data : DEFAULT_BRAND_SETTINGS), watermark: { x: 0.5, y: 0.08, width: 0.2, opacity: 1, ...(existing.success ? existing.data.watermark : {}), file: filename } };
    await context.store.saveSettings({ ...settings, brand });
    return c.json({ ...brand, file: filename });
  });

  app.delete("/api/system/brand/watermark", async c => {
    const settings = await context.store.readSettings();
    const parsed = BrandSettings.safeParse(settings.brand);
    const brand = parsed.success ? parsed.data : DEFAULT_BRAND_SETTINGS;
    const file = brand.watermark?.file;
    if (file && /^watermark\.(png|jpg|webp)$/.test(file)) await rm(path.join(context.store.root, "brand", file), { force: true });
    const next = { ...brand, watermark: brand.watermark ? { ...brand.watermark, file: undefined } : undefined };
    if (next.watermark) delete next.watermark.file;
    await context.store.saveSettings({ ...settings, brand: next });
    return c.json(next);
  });

  app.post("/api/system/brand/title-image", async c => {
    const { path: source } = await parseJson(c, z.object({ path: z.string().trim().min(1) }));
    let image: Awaited<ReturnType<typeof validateBrandImage>>;
    try { image = await validateBrandImage(source, "타이틀 이미지"); }
    catch (error) { throw new HttpError(400, "invalid-title-image", error instanceof Error ? error.message : "타이틀 이미지를 확인할 수 없습니다"); }
    const root = path.join(context.store.root, "brand");
    const filename = `title${image.extension}`;
    await mkdir(root, { recursive: true });
    await copyFile(source, path.join(root, filename));
    const settings = await context.store.readSettings();
    const parsed = BrandSettings.safeParse(settings.brand);
    const existing = parsed.success ? parsed.data : DEFAULT_BRAND_SETTINGS;
    const brand = { ...existing, titleBar: { ...existing.titleBar, kind: "image" as const, file: filename } };
    await context.store.saveSettings({ ...settings, brand });
    if (existing.titleBar.file && existing.titleBar.file !== filename) await rm(path.join(root, existing.titleBar.file), { force: true });
    return c.json({ ...brand, file: filename });
  });

  app.delete("/api/system/brand/title-image", async c => {
    const settings = await context.store.readSettings();
    const parsed = BrandSettings.safeParse(settings.brand);
    const brand = parsed.success ? parsed.data : DEFAULT_BRAND_SETTINGS;
    const { file, ...titleBar } = brand.titleBar;
    if (file) await rm(path.join(context.store.root, "brand", file), { force: true });
    const next = { ...brand, titleBar };
    await context.store.saveSettings({ ...settings, brand: next });
    return c.json(next);
  });

  app.get("/api/system/intro-sfx", async c => {
    const settings = await context.store.readSettings();
    const parsed = IntroSfx.safeParse(settings.introSfx);
    const library = await listSfx(context.resourceDir ?? process.cwd());
    const introSfx = parsed.success ? parsed.data : DEFAULT_INTRO_SFX;
    const root = context.resourceDir ?? process.cwd();
    const item = library.find(sfx => sfx.category === "notify" && createLibraryReference(pathRelativeLibrary(sfx.file, root)) === introSfx.ref)
      ?? library.find(sfx => sfx.category === "notify" && sfx.title === "띠링- 소리");
    const resolved = { ...introSfx, ref: item ? createLibraryReference(pathRelativeLibrary(item.file, root)) : introSfx.ref };
    if (!parsed.success) await context.store.saveSettings({ ...settings, introSfx: resolved });
    return c.json({ ...resolved, title: item?.title ?? "띠링- 소리", durationSec: item?.durationSec ?? 1.5 });
  });

  app.put("/api/system/intro-sfx", async c => {
    const value = await parseJson(c, IntroSfx);
    const library = await listSfx(context.resourceDir ?? process.cwd());
    const selected = library.find(sfx => sfx.category === "notify" && createLibraryReference(pathRelativeLibrary(sfx.file, context.resourceDir ?? process.cwd())) === value.ref);
    if (!selected) return c.json({ error: "알림음 라이브러리의 notify 소리를 선택해 주세요" }, 400);
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, introSfx: value });
    return c.json({ ...value, title: selected.title, durationSec: selected.durationSec });
  });
  app.get("/api/system/image-options", async c => {
    const settings = await context.store.readSettings();
    const parsed = ImageOptions.safeParse(settings.imageOptions);
    return c.json(parsed.success ? parsed.data : DEFAULT_IMAGE_OPTIONS);
  });

  app.put("/api/system/image-options", async c => {
    const imageOptions = await parseJson(c, ImageOptions);
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, imageOptions });
    (context.imageQueue ??= new ImageQueue()).setConcurrency(imageOptions.concurrency);
    return c.json(imageOptions);
  });

  app.get("/api/system", async c => {
    const bin = await context.codexPath();
    const codex = bin ? await codexLoginStatus(bin) : { installed: false, loggedIn: false };
    const settings = await context.store.readSettings();
    return c.json({
      codex,
      jev: { available: context.jevAvailable, enabled: settings.jevEnabled !== false, model: "jev-1.13.0", boxModel: "jev-1.14.0" },
    });
  });

  app.put("/api/system/jev", async c => {
    const { enabled } = await parseJson(c, z.object({ enabled: z.boolean() }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, jevEnabled: enabled });
    return c.json({ enabled, available: context.jevAvailable, model: "jev-1.13.0", boxModel: "jev-1.14.0" });
  });

  app.get("/api/system/codex-settings", async c => {
    const settings = await context.store.readSettings();
    return c.json({ model: typeof settings.codexModel === "string" ? settings.codexModel : "gpt-6-luna", effort: typeof settings.codexEffort === "string" ? settings.codexEffort : "medium" });
  });

  app.get("/api/system/codex-models", async c => c.json(await readCodexModels(await context.codexPath())));

  app.get("/api/system/script-prompt", async c => {
    const settings = await context.store.readSettings();
    const prompt = typeof settings.scriptPrompt === "string" && settings.scriptPrompt.trim()
      ? settings.scriptPrompt
      : DEFAULT_SCRIPT_PROMPT;
    return c.json({ prompt, isDefault: prompt === DEFAULT_SCRIPT_PROMPT, rulesPreview: formatScriptInputGuidePreview() });
  });

  app.put("/api/system/script-prompt", async c => {
    const { prompt: rawPrompt } = await parseJson(c, z.object({ prompt: z.string().max(SCRIPT_PROMPT_MAX_LENGTH) }));
    const prompt = rawPrompt.trim();
    const settings = await context.store.readSettings();
    if (!prompt || prompt === DEFAULT_SCRIPT_PROMPT) delete settings.scriptPrompt;
    else settings.scriptPrompt = prompt;
    await context.store.saveSettings(settings);
    const savedPrompt = prompt || DEFAULT_SCRIPT_PROMPT;
    return c.json({ prompt: savedPrompt, isDefault: savedPrompt === DEFAULT_SCRIPT_PROMPT, rulesPreview: formatScriptInputGuidePreview() });
  });

  app.get("/api/system/script-voice", async c => {
    const settings = await context.store.readSettings();
    return c.json({
      tone: typeof settings.scriptTone === "string" ? settings.scriptTone : "",
      persona: typeof settings.scriptPersona === "string" ? settings.scriptPersona : "",
      review: typeof settings.scriptReview === "string" && settings.scriptReview.trim() ? settings.scriptReview : DEFAULT_SCRIPT_REVIEW_PROMPT,
    });
  });

  app.put("/api/system/script-voice", async c => {
    const value = await parseJson(c, z.object({
      tone: z.string().max(4000),
      persona: z.string().max(4000), review: z.string().max(SCRIPT_PROMPT_MAX_LENGTH),
    }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({
      ...settings,
      scriptTone: value.tone,
      scriptPersona: value.persona,
      scriptReview: value.review,
    });
    return c.json({ ...value, review: value.review.trim() ? value.review : DEFAULT_SCRIPT_REVIEW_PROMPT });
  });

  app.put("/api/system/codex-settings", async c => {
    const value = await parseJson(c, z.object({ model: z.string().trim().min(1), effort: z.string().trim().min(1) }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, codexModel: value.model, codexEffort: value.effort });
    return c.json(value);
  });

  app.put("/api/system/codex-path", async c => {
    const { path } = await parseJson(c, z.object({ path: z.string().trim().min(1) }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, codexPath: path });
    return c.json({ path });
  });

  app.delete("/api/system/codex-path", async c => {
    const settings = await context.store.readSettings();
    delete settings.codexPath;
    await context.store.saveSettings(settings);
    return c.json({ path: null });
  });

  app.get("/api/system/model-paths", async c => {
    const settings = await context.store.readSettings();
    const modelPaths = settings.modelPaths && typeof settings.modelPaths === "object" ? settings.modelPaths : {};
    return c.json(modelPaths);
  });

  app.put("/api/system/model-paths", async c => {
    const paths = await parseJson(c, z.object({ mrx: z.string().trim().min(1).optional(), whisperCli: z.string().trim().min(1).optional(), silero: z.string().trim().min(1).optional() }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, modelPaths: paths });
    return c.json(paths);
  });

  app.get("/api/usage", async c => c.json(await readUsage(context.store.root)));
}
