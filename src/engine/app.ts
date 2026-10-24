import { Hono } from "hono";
import { z } from "zod";
import { Project } from "../core/schema";
import { HttpError, localOnly, parseJson, tokenGuard } from "./http";
import { Jobs } from "./jobs";
import { Store } from "./store";
import { registerEventRoutes } from "./routes/events";
import { registerProjectRoutes } from "./routes/projects";
import { registerInputRoutes } from "./routes/inputs";
import { registerScriptRoutes } from "./routes/script";
import { registerMemeRoutes } from "./routes/memes";
import { registerLibraryRoutes } from "./routes/library";
import { registerSystemRoutes } from "./routes/system";
import { registerMediaRoutes } from "./routes/media";
import { registerFrameRoutes } from "./routes/frames";
import type { MemeIndex } from "./pipeline/meme-embed";

export type AppContext = { store: Store; jobs: Jobs; token: string; tauriOrigin?: string; codexPath: () => Promise<string|null>; jevAvailable: boolean; memeIndex?: MemeIndex };
export function createApp(ctx: AppContext) {
  const app = new Hono();
  app.onError((err,c) => { const e=err instanceof HttpError?err:new HttpError(500,"internal",err.message||"서버 오류"); return c.json({error:{code:e.code,message:e.message}},e.status); });
  app.use("/api/*", localOnly(ctx.tauriOrigin)); app.use("/api/*", tokenGuard(ctx.token));
  app.get("/api/health", c=>c.json({ok:true}));
  registerProjectRoutes(app,ctx); registerInputRoutes(app,ctx); registerScriptRoutes(app,ctx); registerMemeRoutes(app,ctx); registerLibraryRoutes(app,ctx); registerSystemRoutes(app,ctx); registerMediaRoutes(app,ctx); registerFrameRoutes(app,ctx); registerEventRoutes(app,ctx);
  return app;
}
export { Project, parseJson, z };
