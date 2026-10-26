import type { Hono } from "hono";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { AppContext } from "../app";
import { parseJson } from "../http";
import { codexLoginStatus } from "../pipeline/codex-path";
import { readUsage } from "../pipeline/usage";
import { DEFAULT_SCRIPT_PROMPT } from "../../core/script-prompt";
import { formatScriptInputGuidePreview } from "../pipeline/script-validation";

const execFileAsync = promisify(execFile);
const DEFAULT_CODEX_MODELS = [{ slug: "gpt-6-luna", displayName: "GPT-6-Luna", efforts: ["low", "medium", "high"] }];

async function readCodexModels(bin: string | null) {
  if (!bin) return { source: "fallback" as const, models: DEFAULT_CODEX_MODELS };
  try {
    const { stdout } = await execFileAsync(bin, ["debug", "models", "--bundled"], { timeout: 8_000, maxBuffer: 32 * 1024 * 1024 });
    const catalog = JSON.parse(stdout) as { models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown; supported_reasoning_levels?: Array<{ effort?: unknown }> }> };
    const models = catalog.models?.flatMap(model => {
      if (typeof model.slug !== "string" || model.visibility !== "list") return [];
      const efforts = model.supported_reasoning_levels?.flatMap(item => typeof item.effort === "string" ? [item.effort] : []) ?? [];
      return [{ slug: model.slug, displayName: typeof model.display_name === "string" ? model.display_name : model.slug, efforts }];
    });
    return models?.length ? { source: "codex-cli" as const, models } : { source: "fallback" as const, models: DEFAULT_CODEX_MODELS };
  } catch {
    return { source: "fallback" as const, models: DEFAULT_CODEX_MODELS };
  }
}

export function registerSystemRoutes(app: Hono, context: AppContext): void {
  app.get("/api/system", async c => {
    const bin = await context.codexPath();
    const codex = bin ? await codexLoginStatus(bin) : { installed: false, loggedIn: false };
    return c.json({
      codex,
      jev: { available: context.jevAvailable, model: "jev-1.13.0" },
    });
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
    const { prompt: rawPrompt } = await parseJson(c, z.object({ prompt: z.string().max(4000) }));
    const prompt = rawPrompt.trim();
    const settings = await context.store.readSettings();
    if (!prompt || prompt === DEFAULT_SCRIPT_PROMPT) delete settings.scriptPrompt;
    else settings.scriptPrompt = prompt;
    await context.store.saveSettings(settings);
    const savedPrompt = prompt || DEFAULT_SCRIPT_PROMPT;
    return c.json({ prompt: savedPrompt, isDefault: savedPrompt === DEFAULT_SCRIPT_PROMPT, rulesPreview: formatScriptInputGuidePreview() });
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
