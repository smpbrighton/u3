import type { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { jevClientFromEnv } from "../pipeline/jev";
import { listMemes } from "../pipeline/library";
import { rankSceneMemes, createUsageLog } from "../pipeline/meme-rank";

const MemeRankRequest = z.object({
  caption: z.string().min(1),
  reaction: z.string().nullable().optional(),
  query: z.string().min(1),
});

export function registerMemeRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/memes/rank", async c => {
    const projectId = c.req.param("id");
    if (!await context.store.getProject(projectId)) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const input = await parseJson(c, MemeRankRequest);
    const root = process.env.U3_LIBRARY_DIR;
    const library = await listMemes(root);
    const ranking = await rankSceneMemes({
      jev: jevClientFromEnv(),
      usage: createUsageLog(context.store.root),
      index: context.memeIndex ?? null,
    }, {
      caption: input.caption,
      query: input.query,
      ...(input.reaction ? { reaction: input.reaction } : {}),
    }, library, projectId);
    return c.json(ranking);
  });
}
