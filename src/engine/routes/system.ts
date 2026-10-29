import { applyPrompt, promptState } from "../prompt-settings";
import type { PromptDefaults } from "../../core/default-prompts";
import { capabilities, enginePlatform } from "../platform";
import type { Hono } from "hono";
import { TTS_SPEAKERS, ttsSettingsOf } from "../../core/tts-clips";
import path from "node:path";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { z } from "zod";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { codexLoginStatus } from "../pipeline/codex-path";
import { codexSelection, readCodexModels } from "../codex-settings";
import { readUsage } from "../pipeline/usage";
import { SCRIPT_PROMPT_MAX_LENGTH } from "../../core/script-prompt";
import { CAROUSEL_PROMPT_MAX_LENGTH } from "../../core/carousel-prompt";
import { formatScriptInputGuidePreview } from "../pipeline/script-validation";
import { ImageQueue } from "../image-queue";
import { listSfx } from "../pipeline/library";
import { createLibraryReference } from "../../core/library-reference";
import { BrandSettings, DEFAULT_BRAND_SETTINGS } from "../../core/schema";
import { validateBrandImage } from "../brand-image";
import { deleteJevKey, saveJevKey } from "../jev-key";
import { JEV_MODEL, JevError, typesafeJevClient } from "../pipeline/jev";
import { JEV_BOX_MODEL } from "../pipeline/jev-box";
import { STUDIO_ACTIONS, StudioShortcutTable, parseStudioShortcuts, shortcutConflict, type Platform } from "../../core/studio-shortcuts";

const IntroSfx = z.object({ enabled: z.boolean(), ref: z.string().min(1), atSec: z.number().min(0).max(10) });
const DEFAULT_INTRO_SFX = { enabled: true, ref: "u3-library:sfx/notify/sfx-mum36456-06c20f.mp3", atSec: 3 };
const pathRelativeLibrary = (file: string, root: string) => path.relative(path.basename(root) === "library" ? root : path.join(root, "library"), file);

const ImageOptions = z.object({ model: z.enum(["flare", "sunburst"]), quality: z.enum(["low", "medium", "high", "auto"]), aspect: z.enum(["4:5", "1:1", "9:16", "16:9"]), concurrency: z.number().int().min(1).max(10) });
const DEFAULT_IMAGE_OPTIONS = { model: "flare" as const, quality: "auto" as const, aspect: "4:5" as const, concurrency: 3 };

function carouselPromptSettings(settings: Record<string, unknown>, defaults: PromptDefaults) {
  return { topic: promptState(settings, defaults, "topic"), video: promptState(settings, defaults, "video") };
}

function scriptVoiceSettings(settings: Record<string, unknown>, defaults: PromptDefaults) {
  return { tone: promptState(settings, defaults, "tone"), persona: promptState(settings, defaults, "persona") };
}

export function registerSystemRoutes(app: Hono, context: AppContext): void {
  const shortcutPlatform = (): Platform => process.platform === "darwin" ? "mac" : "win";

  app.post("/api/system/client-log", async c => {
    const { method, path, message } = await parseJson(c, z.object({
      method: z.string().max(200),
      path: z.string().max(500),
      message: z.string().max(500),
    }));
    const singleLine = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, " ");
    const requestPath = path.split(/[?#]/, 1)[0];
    const errorMessage = message.replace(/[?#]\S*/g, "");
    context.log?.(`[ui] 연결 실패 ${singleLine(method)} ${singleLine(requestPath)} : ${singleLine(errorMessage)}`);
    return c.json({ ok: true });
  });

  app.get("/api/system/studio-shortcuts", async c => {
    const settings = await context.store.readSettings();
    return c.json({ bindings: parseStudioShortcuts(settings.studioShortcuts, shortcutPlatform()) });
  });

  app.put("/api/system/studio-shortcuts", async c => {
    const bindings = await parseJson(c, StudioShortcutTable);
    for (const { id } of STUDIO_ACTIONS) {
      const conflict = shortcutConflict(bindings, id, bindings[id], shortcutPlatform());
      if (!conflict) continue;
      const message = conflict.kind === "action" ? `${STUDIO_ACTIONS.find(action => action.id === conflict.id)!.label}에서 사용 중이에요`
        : conflict.kind === "text" ? "글 편집에 사용하는 조합이에요" : "시스템에서 사용하는 조합이에요";
      throw new HttpError(400, "shortcut-conflict", message, { action: id, conflict });
    }
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, studioShortcuts: bindings });
    return c.json({ bindings });
  });

  async function jevStatus() {
    const key = await context.jevKey();
    const settings = await context.store.readSettings();
    return { available: !!key, hasKey: !!key, keyHint: key ? key.slice(-4) : null, enabled: settings.jevEnabled !== false, model: JEV_MODEL, boxModel: JEV_BOX_MODEL };
  }

  app.get("/api/system/busy", c => {
    const jobs = context.jobs.list().filter(job => job.status === "queued" || job.status === "running" || job.stopping)
      .map(({ id, kind, label, status, stopping }) => ({ id, kind, label, status, stopping }));
    return c.json({ busy: jobs.length > 0, jobs });
  });

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
    const codex = bin ? await codexLoginStatus(bin) : { installed: false, loggedIn: false, version: null, outdated: false };
    return c.json({
      platform: enginePlatform(),
      logFile: path.join(context.store.root, "logs", "engine.log"),
      capabilities: capabilities(),
      codex,
      jev: await jevStatus(),
    });
  });

  app.get("/api/system/jev", async c => c.json(await jevStatus()));

  app.put("/api/system/jev-key", async c => {
    const { key } = await parseJson(c, z.object({ key: z.string().trim().min(1).max(4000).regex(/^[^\x00-\x1f\x7f]+$/, "키를 확인해 주세요") }));
    let warning: string | undefined;
    try {
      await typesafeJevClient({ apiKey: key, timeoutMs: 8_000, maxRetries: 0 }).ask({
        state: { text: "U3 key check" },
        questions: { valid: { type: "noul", instructions: "Does the text mention U3?" } },
      });
    } catch (error) {
      if (error instanceof JevError && (error.status === 401 || error.status === 403)) throw new HttpError(400, "invalid-jev-key", "키를 확인해 주세요");
      warning = "연결을 확인하지 못했지만 키를 저장했어요. 나중에 다시 확인해 주세요.";
    }
    try { await (context.jevKeyStore?.saveJevKey ?? saveJevKey)(key); }
    catch { throw new HttpError(500, "jev-key-save", "Jev 키를 보안 저장소에 저장하지 못했습니다"); }
    return c.json({ ...await jevStatus(), ...(warning ? { warning } : {}) });
  });

  app.delete("/api/system/jev-key", async c => {
    try { await (context.jevKeyStore?.deleteJevKey ?? deleteJevKey)(); }
    catch { throw new HttpError(500, "jev-key-delete", "Jev 키를 보안 저장소에서 지우지 못했습니다"); }
    return c.json(await jevStatus());
  });

  app.put("/api/system/jev", async c => {
    const { enabled } = await parseJson(c, z.object({ enabled: z.boolean() }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, jevEnabled: enabled });
    return c.json(await jevStatus());
  });

  app.get("/api/system/codex-settings", async c => {
    const { model, effort, resolved } = await codexSelection(context);
    return c.json({ model, effort, resolved });
  });

  app.get("/api/system/codex-models", async c => c.json(await readCodexModels(await context.codexPath())));

  app.get("/api/system/script-prompt", async c => {
    const defaults = await context.promptDefaults!();
    const settings = await context.store.readSettings();
    return c.json({ ...promptState(settings, defaults, "script"), rulesPreview: formatScriptInputGuidePreview() });
  });

  app.put("/api/system/script-prompt", async c => {
    const { prompt } = await parseJson(c, z.object({ prompt: z.string().max(SCRIPT_PROMPT_MAX_LENGTH) }));
    const defaults = await context.promptDefaults!();
    const settings = await context.store.readSettings();
    applyPrompt(settings, defaults, "script", prompt);
    await context.store.saveSettings(settings);
    return c.json({ ...promptState(settings, defaults, "script"), rulesPreview: formatScriptInputGuidePreview() });
  });

  app.get("/api/system/carousel-prompts", async c => {
    const defaults = await context.promptDefaults!();
    return c.json(carouselPromptSettings(await context.store.readSettings(), defaults));
  });

  app.put("/api/system/carousel-prompts", async c => {
    const input = await parseJson(c, z.object({
      topic: z.string().max(CAROUSEL_PROMPT_MAX_LENGTH).optional(),
      video: z.string().max(CAROUSEL_PROMPT_MAX_LENGTH).optional(),
    }));
    const defaults = await context.promptDefaults!();
    const settings = await context.store.readSettings();
    for (const kind of ["topic", "video"] as const) {
      const raw = input[kind];
      if (raw !== undefined) applyPrompt(settings, defaults, kind, raw);
    }
    await context.store.saveSettings(settings);
    return c.json(carouselPromptSettings(settings, defaults));
  });

  app.get("/api/system/script-voice", async c => {
    const defaults = await context.promptDefaults!();
    return c.json(scriptVoiceSettings(await context.store.readSettings(), defaults));
  });

  app.get("/api/system/tts-settings", async c => c.json(ttsSettingsOf(await context.store.readSettings())));
  app.put("/api/system/tts-settings", async c => {
    const value = await parseJson(c, z.object({ speaker: z.enum(TTS_SPEAKERS), instruct: z.string().max(4000) }));
    const settings = await context.store.readSettings();
    await context.store.saveSettings({ ...settings, ttsSpeaker: value.speaker, ttsInstruct: value.instruct });
    return c.json(value);
  });

  app.put("/api/system/script-voice", async c => {
    const value = await parseJson(c, z.object({
      tone: z.string().max(4000).optional(),
      persona: z.string().max(4000).optional(),
    }));
    const defaults = await context.promptDefaults!();
    const settings = await context.store.readSettings();
    for (const kind of ["tone", "persona"] as const) {
      const raw = value[kind];
      if (raw !== undefined) applyPrompt(settings, defaults, kind, raw);
    }
    await context.store.saveSettings(settings);
    return c.json(scriptVoiceSettings(settings, defaults));
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
