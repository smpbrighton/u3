import type { Hono } from "hono";
import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../app";
import { HttpError } from "../http";
import { extractFrames, extractThumbnail, frameAllocation, frameInputsWithDuration } from "../pipeline/frames";
import { scriptFrameSecs } from "../../core/carousel-frame";
import { mediaUrl } from "../pipeline/media-server";

export function registerFrameRoutes(app: Hono, context: AppContext): void {
  app.get("/api/projects/:id/frames/list", async c => {
    const id = c.req.param("id"); const project = await context.store.requireProject(id);
    const result: Array<{ inputId: string; frames: Array<{ file: string; url: string; sec: number }> }> = [];
    for (const input of project.inputs.filter(item => item.id !== "placeholder")) {
      const directory = path.join(context.store.projectDir(id), "input", ".frames", input.id);
      const files = (await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      })).filter(item => item.isFile() && /^frame-\d+\.jpg$/.test(item.name)).map(item => item.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (!files.length) continue;
      const secs = scriptFrameSecs(files.length, input.kind === "video" ? input.durationSec ?? 0 : 0);
      result.push({ inputId: input.id, frames: files.map((name, index) => {
        const file = path.join(directory, name), relative = path.relative(context.store.projectDir(id), file);
        return { file, sec: secs[index]!, url: context.mediaServer?.url("projects", `${id}/${relative}`) ?? mediaUrl(id, relative, context.token, new URL(c.req.url).origin) };
      }) });
    }
    return c.json(result);
  });

  app.get("/api/projects/:id/inputs/:inputId/thumbnail", async c => {
    const id = c.req.param("id");
    const inputId = c.req.param("inputId");
    const project = await context.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const input = project.inputs.find(item => item.id === inputId);
    if (!input) throw new HttpError(404, "input-not-found", "입력 항목이 없습니다");
    const source = path.resolve(context.store.projectDir(id), input.file);
    const thumbnail = path.join(context.store.projectDir(id), "input", ".thumbnails", `${input.id}.jpg`);
    await access(thumbnail).catch(() => extractThumbnail(source, thumbnail));
    const relative = path.relative(context.store.projectDir(id), thumbnail);
    const origin = new URL(c.req.url).origin;
    const url = context.mediaServer?.url("projects", `${id}/${relative}`)
      ?? mediaUrl(id, relative, context.token, origin);
    return c.json({ url });
  });

  app.post("/api/projects/:id/frames", async c => {
    const id = c.req.param("id");
    const project = await context.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");

    const inputs = await frameInputsWithDuration(project.inputs, context.store.projectDir(id));
    const counts = frameAllocation(inputs);
    const origin = new URL(c.req.url).origin;
    const frameUrl = (file: string) => {
      const relative = path.relative(context.store.projectDir(id), file);
      return context.mediaServer?.url("projects", `${id}/${relative}`)
        ?? mediaUrl(id, relative, context.token, origin);
    };
    const output: { inputId: string; frames: { file: string; url: string }[] }[] = [];

    for (const [index, input] of inputs.entries()) {
      const source = path.resolve(context.store.projectDir(id), input.file);
      const directory = path.join(context.store.projectDir(id), "input", ".frames", input.id);
      await mkdir(directory, { recursive: true });
      const frames = input.kind === "video"
        ? await extractFrames(source, directory, counts[index])
        : await extractFrames(source, directory, 1, undefined, true);
      output.push({ inputId: input.id, frames: frames.map(file => ({ file, url: frameUrl(file) })) });
    }

    return c.json(output);
  });
}
