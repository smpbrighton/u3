import type { Hono } from "hono";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CodexScript } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { codexCliRunner } from "../pipeline/codex";
import { recordUsage } from "../pipeline/usage";
import { extractFrames, frameAllocation } from "../pipeline/frames";

export function registerScriptRoutes(app: Hono, context: AppContext): void {
  app.get("/api/projects/:id/script", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    try {
      const script = JSON.parse(await readFile(path.join(context.store.projectDir(project.id), "script.json"), "utf8"));
      return c.json(CodexScript.parse(script));
    } catch {
      return c.json(null);
    }
  });

  app.put("/api/projects/:id/script", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { script } = await parseJson(c, z.object({ script: CodexScript }));
    await writeFile(path.join(context.store.projectDir(project.id), "script.json"), `${JSON.stringify(script, null, 2)}\n`);
    return c.json(script);
  });

  app.post("/api/projects/:id/script/recommend", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const request = await parseJson(c, z.object({
      prompt: z.string().trim().min(1),
      images: z.array(z.string().min(1)).optional(),
    }));
    const bin = await context.codexPath();
    if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");

    const job = context.jobs.enqueue("대본 추천", async ({ signal, progress }) => {
      progress(0.1, "Codex 실행 중");
      const settings = await context.store.readSettings();
      const result = await codexCliRunner({ bin, model: typeof settings.codexModel === "string" ? settings.codexModel : "gpt-6-luna", effort: typeof settings.codexEffort === "string" ? settings.codexEffort : "medium" }).runScript({
        ...request,
        signal,
        transcribe: context.transcribeInput,
        prepareImages: async () => {
          if (request.images?.length) return request.images;
          const videos = project.inputs.filter(input => input.kind === "video");
          const photos = project.inputs.filter(input => input.kind === "photo");
          const counts = frameAllocation(videos.length, photos.length);
          const images: string[] = [];
          for (const [index, input] of videos.entries()) {
            const source = path.resolve(context.store.projectDir(project.id), input.file);
            const directory = path.join(context.store.projectDir(project.id), "input", ".frames", input.id);
            await mkdir(directory, { recursive: true });
            images.push(...await extractFrames(source, directory, counts[index] ?? 10));
          }
          for (const input of photos) {
            const source = path.resolve(context.store.projectDir(project.id), input.file);
            const directory = path.join(context.store.projectDir(project.id), "input", ".frames", input.id);
            await mkdir(directory, { recursive: true });
            images.push(...await extractFrames(source, directory, 1, undefined, true));
          }
          return images;
        },
        transcriptInputs: project.inputs.filter(input => input.kind === "video").map(input => ({
          inputId: input.id,
          file: path.resolve(context.store.projectDir(project.id), input.file),
        })),
      });
      await mkdir(context.store.projectDir(project.id), { recursive: true });
      await writeFile(path.join(context.store.projectDir(project.id), "script.json"), `${JSON.stringify(result.output, null, 2)}\n`);
      const tokenCount = Object.values(result.usage).reduce((total, amount) => total + amount, 0);
      if (tokenCount > 0) await recordUsage(context.store.root, "codex", tokenCount);
      progress(1, "대본 추천 완료");
      return { script: result.output, transcriptWarnings: result.transcriptWarnings };
    });
    return c.json(job, 202);
  });
}
