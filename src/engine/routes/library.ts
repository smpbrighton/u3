import type { Hono } from "hono";
import path from "node:path";
import { createLibraryReference } from "../../core/library-reference";
import type { AppContext } from "../app";
import { listMemes, listSfx, searchLibrary } from "../pipeline/library";
import { mediaUrl } from "../pipeline/media-server";

function libraryMediaUrl(
  file: string,
  root: string,
  context: AppContext,
  origin: string,
): string {
  const libraryRoot = path.basename(root) === "library" ? root : path.join(root, "library");
  const relative = path.relative(libraryRoot, file);
    return context.mediaServer?.url("library", relative)
    ?? `${origin}/api/media/library/${relative.split(path.sep).map(encodeURIComponent).join("/")}?token=${encodeURIComponent(context.token)}`;
}

function libraryMediaReference(file: string, root: string): string {
  const libraryRoot = path.basename(root) === "library" ? root : path.join(root, "library");
  return createLibraryReference(path.relative(libraryRoot, file));
}

function page(items: ReturnType<typeof searchLibrary>, c: { req: { query: (name: string) => string | undefined } }) {
  const limit = Number(c.req.query("limit"));
  const offset = Number(c.req.query("offset"));
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) return items;
  return items.slice(offset, offset + Math.min(limit, 200));
}

export function registerLibraryRoutes(app: Hono, context: AppContext): void {
  app.get("/api/library/memes", async c => {
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const items = page(searchLibrary(await listMemes(root), c.req.query("q") ?? ""), c);
    const origin = new URL(c.req.url).origin;
    return c.json(items.map(item => ({ ...item, ref: libraryMediaReference(item.file, root), url: libraryMediaUrl(item.file, root, context, origin) })));
  });

  app.get("/api/library/sfx", async c => {
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const items = searchLibrary(await listSfx(root), c.req.query("q") ?? "");
    const origin = new URL(c.req.url).origin;
    return c.json(items.map(item => ({ ...item, ref: libraryMediaReference(item.file, root), url: libraryMediaUrl(item.file, root, context, origin) })));
  });
}
