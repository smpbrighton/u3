import type { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../app";
import { parseJson } from "../http";
import { codexLoginStatus } from "../pipeline/codex-path";
import { readUsage } from "../pipeline/usage";

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

  app.put("/api/system/codex-settings", async c => {
    const value = await parseJson(c, z.object({ model: z.string().trim().min(1), effort: z.enum(["low", "medium", "high", "xhigh", "max"]) }));
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
