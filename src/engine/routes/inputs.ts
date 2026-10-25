import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Project } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { ffprobe } from "../pipeline/ffmpeg";

export function registerInputRoutes(app: Hono, ctx: AppContext) {
  app.post("/api/projects/:id/inputs", async c => {
    const id = c.req.param("id");
    const project = await ctx.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const fileSchema = z.object({
      path: z.string().min(1),
      kind: z.enum(["video", "photo"]),
      durationSec: z.number().positive().optional(),
    });
    const { files } = await parseJson(c, z.object({ files: z.array(fileSchema).min(1).max(20) }));
    const existing = project.inputs.filter(input => input.id !== "placeholder");
    if (existing.length + files.length > 20) throw new HttpError(400, "too-many-inputs", "입력은 20개까지 추가할 수 있습니다");
    const added = files.map(file => ({ file, id: randomBytes(6).toString("hex"), dest: "" }));
    for (const item of added) {
      item.dest = path.join(ctx.store.projectDir(id), "input", `${item.id}${path.extname(item.file.path)}`);
      await mkdir(path.dirname(item.dest), { recursive: true });
      await copyFile(item.file.path, item.dest);
    }
    const addedInputs = await Promise.all(added.map(async item => {
      let durationSec = item.file.durationSec;
      if (item.file.kind === "video" && durationSec === undefined) {
        try {
          durationSec = Number((await ffprobe(item.dest)).format.duration) || undefined;
        } catch {
          durationSec = undefined;
        }
      }
      return {
        id: item.id,
        kind: item.file.kind,
        file: path.relative(ctx.store.projectDir(id), item.dest),
        displayName: path.basename(item.file.path),
        ...(durationSec ? { durationSec } : {}),
      };
    }));
    const inputs = [
      ...existing,
      ...addedInputs,
    ];
    return c.json(await ctx.store.saveProject(Project.parse({ ...project, inputs, savedAt: new Date().toISOString() })), 201);
  });
  app.put("/api/projects/:id/inputs/order", async c => {
    const project = await ctx.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { ids } = await parseJson(c, z.object({ ids: z.array(z.string()).min(1).max(20) }));
    const invalid = ids.length !== project.inputs.length
      || new Set(ids).size !== ids.length
      || ids.some(id => !project.inputs.some(input => input.id === id));
    if (invalid) throw new HttpError(400, "invalid-order", "입력 순서가 유효하지 않습니다");
    return c.json(await ctx.store.saveProject({ ...project, inputs: ids.map(id => project.inputs.find(input => input.id === id)!), savedAt: new Date().toISOString() }));
  });
}
