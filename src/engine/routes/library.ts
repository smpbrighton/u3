import type { Hono } from "hono";
import path from "node:path";
import { createLibraryReference } from "../../core/library-reference";
import type { AppContext } from "../app";
import { SCENE_SFX_USES, orderSfxSituationCandidates, readSfxFits, sfxSituationFitRequest, type SfxSituationCandidate } from "../../core/sfx";
import { z } from "zod";
import { HttpError, parseJson } from "../http";
import { jevClient } from "../pipeline/jev";
import { listMemes, listSfx, searchLibrary, type LibraryEntry } from "../pipeline/library";
import { judgeMemes, searchMemeCandidates, createUsageLog } from "../pipeline/meme-rank";
import { memeSituationState } from "../../core/meme-rank";
import { fileUsageLog, makeUsageEntry } from "../pipeline/usage";
import { mediaUrl } from "../pipeline/media-server";

const SituationSearch = z.object({ q: z.string().trim().min(1) });
const MemeJudgeRequest = z.object({ q: z.string().trim().min(1), ids: z.array(z.string()).max(90), projectId: z.string().nullable().optional() });
const SfxJudgeRequest = z.object({ q: z.string().trim().min(1), ids: z.array(z.string()).max(90), projectId: z.string().nullable().optional() });

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
  app.post("/api/library/memes/search", async c => {
    const input = await parseJson(c, SituationSearch);
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const library = await listMemes(root);
    const found = await searchMemeCandidates({ index: context.memeIndex ?? null }, input.q, { query: input.q }, library);
    const byId = new Map(library.map(item => [item.id, item]));
    const origin = new URL(c.req.url).origin;
    const items = found.ids.flatMap(id => {
      const item = byId.get(id);
      return item ? [{ ...item, ref: libraryMediaReference(item.file, root), url: libraryMediaUrl(item.file, root, context, origin) }] : [];
    });
    return c.json({ items, by: found.bge.length ? "search" : "rule", embedError: found.embedError ?? null });
  });

  app.post("/api/library/memes/judge", async c => {
    const input = await parseJson(c, MemeJudgeRequest);
    const jev = jevClient(await context.jevKey());
    if (!jev) throw new HttpError(503, "jev-unavailable", "Jev API 키가 없습니다");
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const library = await listMemes(root);
    const result = await judgeMemes({ jev, usage: createUsageLog(context.store.root) }, memeSituationState(input.q), new Map(library.map(item => [item.id, item])), input.ids, input.projectId ?? null);
    return c.json(result);
  });

  app.post("/api/library/sfx/search", async c => {
    const input = await parseJson(c, SituationSearch);
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const library = await listSfx(root);
    const textMatches = new Set(searchLibrary(library, input.q).map(item => item.id));
    const ranked = orderSfxSituationCandidates(input.q, library)
      .sort((a, b) => Number(textMatches.has(b.item.id)) - Number(textMatches.has(a.item.id)) || b.score - a.score)
      .slice(0, 90);
    const origin = new URL(c.req.url).origin;
    const items = ranked.map(({ item }) => ({ ...item, ref: libraryMediaReference(item.file, root), url: libraryMediaUrl(item.file, root, context, origin) }));
    return c.json({ items, by: "rule" });
  });

  app.post("/api/library/sfx/judge", async c => {
    const input = await parseJson(c, SfxJudgeRequest);
    const jev = jevClient(await context.jevKey());
    if (!jev) throw new HttpError(503, "jev-unavailable", "Jev API 키가 없습니다");
    const root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const library = await listSfx(root);
    const byId = new Map(library.map(item => [item.id, item]));
    const candidates: SfxSituationCandidate[] = input.ids.flatMap(id => {
      const item = byId.get(id);
      return item ? [{ id, title: item.title, category: item.category, description: SCENE_SFX_USES[item.category as keyof typeof SCENE_SFX_USES] }] : [];
    });
    const { request, asked, unasked } = sfxSituationFitRequest(input.q, candidates);
    const result = await jev.ask(request);
    await fileUsageLog(context.store.root).append([makeUsageEntry({ provider: "jev", unit: "input_tokens", amount: result.usage.inputTokens, projectId: input.projectId ?? null })]);
    const items = readSfxFits(asked, unasked, result.answers);
    return c.json({ items, model: result.model, elapsedMs: result.latencyMs, inputTokens: result.usage.inputTokens });
  });

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
