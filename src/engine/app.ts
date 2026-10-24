// Hono 앱 조립. uUu src/server/app.ts의 공용 컨텍스트·오류 처리·미들웨어 조립 방식을 따른다.
import { Hono } from "hono";
import type { Store } from "./store";
import type { Jobs } from "./jobs";
import type { MemeIndex } from "./pipeline/meme-embed";
import type { MediaServer } from "./pipeline/media-server";
import type { TranscribeInput } from "./pipeline/codex";
import { errorBody, localOnly, onError, tokenGuard } from "./http";
import { registerEventRoutes } from "./routes/events";
import { registerProjectRoutes } from "./routes/projects";
import { registerInputRoutes } from "./routes/inputs";
import { registerScriptRoutes } from "./routes/script";
import { registerMemeRoutes } from "./routes/memes";
import { registerLibraryRoutes } from "./routes/library";
import { registerSystemRoutes } from "./routes/system";
import { registerMediaRoutes } from "./routes/media";
import { registerFrameRoutes } from "./routes/frames";

export interface AppContext {
  store: Store;
  jobs: Jobs;
  token: string;
  tauriOrigin?: string;
  codexPath: () => Promise<string | null>;
  jevAvailable: boolean;
  memeIndex?: MemeIndex;
  mediaServer?: MediaServer;
  transcribeInput?: TranscribeInput;
}

export function createApp(context: AppContext) {
  const app = new Hono();
  app.onError(onError);
  app.notFound(c => c.json(errorBody("not-found", "요청 경로가 없습니다"), 404));
  app.use("/api/*", localOnly(context.tauriOrigin));
  app.use("/api/*", tokenGuard(context.token));
  app.get("/api/health", c => c.json({ ok: true }));

  registerProjectRoutes(app, context);
  registerInputRoutes(app, context);
  registerScriptRoutes(app, context);
  registerMemeRoutes(app, context);
  registerLibraryRoutes(app, context);
  registerSystemRoutes(app, context);
  registerMediaRoutes(app, context);
  registerFrameRoutes(app, context);
  registerEventRoutes(app, context);
  return app;
}
