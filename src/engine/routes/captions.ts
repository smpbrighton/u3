import type { Hono } from "hono";
import { z } from "zod";
import { captionLayersOf } from "../../core/schema";
import { plainCaptionText } from "../../core/captions";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { CodexError, codexCliRunner } from "../pipeline/codex";
import { recordUsage } from "../pipeline/usage";

const Translation = z.object({ captions: z.array(z.object({ id: z.string(), text: z.string() })) });

export function registerCaptionRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/captions/translate", async c => {
    const project = await context.store.requireProject(c.req.param("id"));
    const { layerId } = await parseJson(c, z.object({ layerId: z.string().min(1) }));
    const layer = captionLayersOf(project.timeline).find(item => item.id === layerId);
    if (!layer) throw new HttpError(404, "not-found", "자막 레이어가 없습니다");
    const bin = await context.codexPath();
    if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
    const settings = await context.store.readSettings();
    const runner = codexCliRunner({ bin, model: typeof settings.codexModel === "string" ? settings.codexModel : "gpt-6-luna", effort: typeof settings.codexEffort === "string" ? settings.codexEffort : "medium" });
    try {
      const result = await runner.run({ schema: Translation, prompt: `Translate each Korean caption into natural English. Preserve IDs. Return every input ID exactly once.\nDo not use asterisks in the translated captions.\n${JSON.stringify(layer.main.map(({ id, text }) => ({ id, text: plainCaptionText(text) })))}` });
      const allowed = new Set(layer.main.map(item => item.id));
      const outputIds = new Set(result.output.captions.map(item => item.id));
      if (result.output.captions.length !== allowed.size || outputIds.size !== allowed.size || result.output.captions.some(item => !allowed.has(item.id))) throw new HttpError(502, "invalid-codex-output", "번역 결과의 자막 id가 입력과 맞지 않습니다");
      const tokens = Object.values(result.usage).reduce((sum, amount) => sum + amount, 0);
      if (tokens > 0) await recordUsage(context.store.root, "codex", tokens);
      return c.json({ captions: result.output.captions });
    } catch (error) {
      if (error instanceof CodexError) {
        const tokens = Object.values(error.usage).reduce((sum, amount) => sum + amount, 0);
        if (tokens > 0) await recordUsage(context.store.root, "codex", tokens);
      }
      throw error;
    }
  });

  app.post("/api/projects/:id/title", async c => {
    const project = await context.store.requireProject(c.req.param("id"));
    const { scenes } = await parseJson(c, z.object({ scenes: z.array(z.object({ caption: z.string(), subCaption: z.string().optional() })).min(1) }));
    const bin = await context.codexPath();
    if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
    const settings = await context.store.readSettings();
    const runner = codexCliRunner({ bin, model: typeof settings.codexModel === "string" ? settings.codexModel : "gpt-6-luna", effort: typeof settings.codexEffort === "string" ? settings.codexEffort : "medium" });
    try {
      const result = await runner.run({ schema: z.object({ title: z.string().min(1).max(30) }), prompt: `Write one concise video title in Korean, at most 30 characters. Use only these script captions as context.\n${JSON.stringify(scenes.map(scene => ({ ...scene, caption: plainCaptionText(scene.caption), ...(scene.subCaption !== undefined ? { subCaption: plainCaptionText(scene.subCaption) } : {}) })))}` });
      const timeline = { ...project.timeline, brand: { ...project.timeline.brand, titleBar: { ...project.timeline.brand?.titleBar, text: result.output.title } } };
      const saved = await context.store.saveProject({ ...project, timeline, savedAt: new Date().toISOString() });
      const tokens = Object.values(result.usage).reduce((sum, amount) => sum + amount, 0);
      if (tokens > 0) await recordUsage(context.store.root, "codex", tokens);
      return c.json({ project: saved, title: result.output.title });
    } catch (error) {
      if (error instanceof CodexError) {
        const tokens = Object.values(error.usage).reduce((sum, amount) => sum + amount, 0);
        if (tokens > 0) await recordUsage(context.store.root, "codex", tokens);
      }
      throw error;
    }
  });
}
