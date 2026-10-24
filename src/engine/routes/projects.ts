import type { Hono } from "hono";
import { z } from "zod";
import { Project } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";

export function registerProjectRoutes(app: Hono, context: AppContext): void {
  app.get("/api/projects", async c => c.json(await context.store.listProjects()));

  app.post("/api/projects", async c => {
    const { name } = await parseJson(c, z.object({ name: z.string().trim().min(1).max(120) }));
    return c.json(await context.store.createProject(name), 201);
  });

  app.get("/api/projects/:id", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    return c.json(project);
  });

  app.put("/api/projects/:id", async c => {
    const project = await parseJson(c, Project);
    if (project.id !== c.req.param("id")) throw new HttpError(400, "id-mismatch", "프로젝트 id가 다릅니다");
    return c.json(await context.store.saveProject(project));
  });
}
