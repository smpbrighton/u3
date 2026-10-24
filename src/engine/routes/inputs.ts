import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Project } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";

export function registerInputRoutes(app: Hono, ctx: AppContext) {
  app.post("/api/projects/:id/inputs", async c => {
    const id = c.req.param("id"), project = await ctx.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { files } = await parseJson(c, z.object({ files: z.array(z.object({ path: z.string().min(1), kind: z.enum(["video", "photo"]), durationSec: z.number().positive().optional() })).min(1).max(20) }));
    const existing = project.inputs.filter(input => input.id !== "placeholder");
    if (existing.length + files.length > 20) throw new HttpError(400, "too-many-inputs", "입력은 20개까지 추가할 수 있습니다");
    const added = files.map(file => ({ file, id: randomBytes(6).toString("hex"), dest: "" }));
    for (const item of added) {
      item.dest = path.join(ctx.store.projectDir(id), "input", `${item.id}${path.extname(item.file.path)}`);
      await mkdir(path.dirname(item.dest), { recursive: true }); await copyFile(item.file.path, item.dest);
    }
    const inputs = [...existing, ...added.map(item => ({ id: item.id, kind: item.file.kind, file: path.relative(ctx.store.projectDir(id), item.dest), ...(item.file.durationSec ? { durationSec: item.file.durationSec } : {}) }))];
    return c.json(await ctx.store.saveProject(Project.parse({ ...project, inputs, savedAt: new Date().toISOString() })), 201);
  });
  app.put("/api/projects/:id/inputs/order", async c => {
    const project = await ctx.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { ids } = await parseJson(c, z.object({ ids: z.array(z.string()).min(1).max(20) }));
    if (ids.length !== project.inputs.length || new Set(ids).size !== ids.length || ids.some(id => !project.inputs.some(input => input.id === id))) throw new HttpError(400, "invalid-order", "입력 순서가 유효하지 않습니다");
    return c.json(await ctx.store.saveProject({ ...project, inputs: ids.map(id => project.inputs.find(input => input.id === id)!), savedAt: new Date().toISOString() }));
  });
}
