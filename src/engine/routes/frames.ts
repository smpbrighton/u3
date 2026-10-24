import type { Hono } from "hono";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../app";
import { HttpError } from "../http";
import { extractFrames, frameAllocation } from "../pipeline/frames";
import { mediaUrl } from "../pipeline/media-server";

export function registerFrameRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/frames", async c => {
    const id = c.req.param("id");
    const project = await context.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");

    const videos = project.inputs.filter(input => input.kind === "video");
    const photos = project.inputs.filter(input => input.kind === "photo");
    let counts: number[];
    try {
      counts = frameAllocation(videos.length, photos.length);
    } catch (error) {
      throw new HttpError(400, "too-many-frames", error instanceof Error ? error.message : "프레임 수가 40장을 넘습니다");
    }
    const origin = new URL(c.req.url).origin;
    const frameUrl = (file: string) => {
      const relative = path.relative(context.store.projectDir(id), file);
      return context.mediaServer?.url("projects", `${id}/${relative}`)
        ?? mediaUrl(id, relative, context.token, origin);
    };
    const output: { inputId: string; frames: { file: string; url: string }[] }[] = [];

    for (const [index, input] of videos.entries()) {
      const source = path.resolve(context.store.projectDir(id), input.file);
      const directory = path.join(context.store.projectDir(id), "input", ".frames", input.id);
      await mkdir(directory, { recursive: true });
      const frames = await extractFrames(source, directory, counts[index] ?? 10);
      output.push({ inputId: input.id, frames: frames.map(file => ({ file, url: frameUrl(file) })) });
    }

    for (const input of photos) {
      const source = path.resolve(context.store.projectDir(id), input.file);
      const directory = path.join(context.store.projectDir(id), "input", ".frames", input.id);
      await mkdir(directory, { recursive: true });
      const frames = await extractFrames(source, directory, 1, undefined, true);
      output.push({ inputId: input.id, frames: frames.map(file => ({ file, url: frameUrl(file) })) });
    }

    const total = output.reduce((sum, item) => sum + item.frames.length, 0);
    if (total > 40) throw new HttpError(400, "too-many-frames", "프로젝트 프레임이 40장을 넘습니다");
    return c.json(output);
  });
}
