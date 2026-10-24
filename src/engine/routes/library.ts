import type { Hono } from "hono";
import path from "node:path";
import type { AppContext } from "../app";
import { listMemes, listSfx, searchLibrary } from "../pipeline/library";

function itemUrl(itemFile: string, kind: "memes" | "sfx", root: string, origin: string, token: string) {
  const library = path.basename(root) === "library" ? root : path.join(root, "library");
  const relative = path.relative(path.join(library, kind), itemFile).split(path.sep).map(encodeURIComponent).join("/");
  return `${origin}/api/media/library/${relative}?token=${encodeURIComponent(token)}`;
}
export function registerLibraryRoutes(app: Hono, ctx: AppContext) {
  app.get("/api/library/memes", async c => {
    const root = process.env.U3_LIBRARY_DIR || path.join(process.cwd(), "resources"), items = searchLibrary(await listMemes(root), c.req.query("q") ?? ""), origin = new URL(c.req.url).origin;
    return c.json(items.map(item => ({ ...item, url: itemUrl(item.file, "memes", root, origin, ctx.token) })));
  });
  app.get("/api/library/sfx", async c => {
    const root = process.env.U3_LIBRARY_DIR || path.join(process.cwd(), "resources"), items = searchLibrary(await listSfx(root), c.req.query("q") ?? ""), origin = new URL(c.req.url).origin;
    return c.json(items.map(item => ({ ...item, url: itemUrl(item.file, "sfx", root, origin, ctx.token) })));
  });
}
