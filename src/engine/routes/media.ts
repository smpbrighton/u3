import type { Hono } from "hono";
import path from "node:path";
import type { AppContext } from "../app";
import { HttpError } from "../http";

function relativePath(encoded: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    throw new HttpError(404, "not-found", "미디어 경로가 올바르지 않습니다");
  }
  if (decoded.includes("\0") || path.isAbsolute(decoded) || decoded.split(/[\\/]/).includes("..")) {
    throw new HttpError(403, "forbidden", "프로젝트 밖의 미디어를 읽을 수 없습니다");
  }
  return decoded;
}

export function registerMediaRoutes(app: Hono, context: AppContext): void {
  app.get("/api/media/projects/:id/*", async c => {
    const id = c.req.param("id");
    await context.store.requireProject(id);
    const prefix = `/api/media/projects/${id}/`;
    const relative = relativePath(c.req.path.slice(prefix.length));
    const root = path.resolve(context.store.projectDir(id));
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new HttpError(403, "forbidden", "프로젝트 밖의 미디어를 읽을 수 없습니다");
    if (!context.mediaServer) throw new HttpError(503, "media-unavailable", "미디어 서버를 사용할 수 없습니다");
    return c.redirect(context.mediaServer.url("projects", `${id}/${relative}`), 302);
  });

  app.get("/api/media/library/*", c => {
    if (!context.mediaServer) throw new HttpError(503, "media-unavailable", "미디어 서버를 사용할 수 없습니다");
    const relative = relativePath(c.req.path.slice("/api/media/library/".length));
    return c.redirect(context.mediaServer.url("library", relative), 302);
  });

  app.get("/api/media/carousels/:id/*", async c => {
    const id = c.req.param("id");
    const carousel = await context.carouselStore?.requireCarousel(id);
    if (!carousel) throw new HttpError(404, "not-found", "캐러셀이 없습니다");
    const prefix = `/api/media/carousels/${id}/`;
    const relative = relativePath(c.req.path.slice(prefix.length));
    const root = path.resolve(context.carouselStore!.carouselDir(id));
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new HttpError(403, "forbidden", "캐러셀 밖의 미디어를 읽을 수 없습니다");
    if (!context.mediaServer) throw new HttpError(503, "media-unavailable", "미디어 서버를 사용할 수 없습니다");
    return c.redirect(context.mediaServer.url("carousels", `${id}/${relative}`), 302);
  });

  app.get("/api/media/brand/*", c => {
    if (!context.mediaServer) throw new HttpError(503, "media-unavailable", "미디어 서버를 사용할 수 없습니다");
    const relative = relativePath(c.req.path.slice("/api/media/brand/".length));
    return c.redirect(context.mediaServer.url("brand", relative), 302);
  });
}
