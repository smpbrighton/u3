// Hono 앱 조립. uUu src/server/app.ts의 공용 컨텍스트·오류 처리·미들웨어 조립 방식을 따른다.
import { Hono } from "hono";
import type { Store } from "./store";
import type { Jobs } from "./jobs";
import type { MemeIndex } from "./pipeline/meme-embed";
import type { MediaServer } from "./pipeline/media-server";
import type { TranscribeInput } from "./pipeline/codex";
import type { ImageAspect, ImageModel, ImageQuality } from "./pipeline/codex-image";
import { cors, errorBody, localOnly, onError, tokenGuard } from "./http";
import { registerEventRoutes } from "./routes/events";
import { registerProjectRoutes } from "./routes/projects";
import { registerInputRoutes } from "./routes/inputs";
import { registerVoiceRoutes } from "./routes/voice";
import { registerScriptRoutes } from "./routes/script";
import { registerMemeRoutes } from "./routes/memes";
import { registerLibraryRoutes } from "./routes/library";
import { registerSystemRoutes } from "./routes/system";
import { registerMediaRoutes } from "./routes/media";
import { registerFrameRoutes } from "./routes/frames";
import { registerRenderRoutes } from "./routes/render";
import { registerSeparateRoutes } from "./routes/separate";
import { registerTranscribeRoutes } from "./routes/transcribe";
import { registerModelRoutes } from "./routes/models";
import { registerOutputRoutes } from "./routes/output";
import { registerCarouselRoutes } from "./routes/carousels";
import { CarouselStore } from "./carousel-store";
import { ImageQueue } from "./image-queue";
import { registerCaptionRoutes } from "./routes/captions";

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
  resourceDir?: string;
  whisperPath?: string;
  sileroPath?: string;
  mrxPath?: string;
  carouselStore?: import("./carousel-store").CarouselStore;
  imageQueue?: import("./image-queue").ImageQueue;
  carouselServices?: {
    refine(input: { topic: string }, signal?: AbortSignal): Promise<{ candidates: Array<{ topic: string; angle: string }>; usage: Record<string, number> }>;
    plan(input: { topic: string; count: number }, signal?: AbortSignal): Promise<{ style: string; slides: Array<{ title: string; body: string; imagePrompt: string }>; topic?: string; usage: Record<string, number> }>;
    generateImage(input: { prompt: string; style: string; model: ImageModel; quality: ImageQuality; aspect: ImageAspect; output: string; signal?: AbortSignal }): Promise<{ output: string; usage: Record<string, number> } | Buffer>;
  };
  composeCarouselSlide?: (carousel: import("../core/carousel").Carousel, slide: import("../core/carousel").CarouselSlide, destination: string) => Promise<void>;
}

export function createApp(context: AppContext) {
  context.imageQueue ??= new ImageQueue();
  context.carouselStore ??= new CarouselStore(context.store.root, id => context.jobs.hasActiveForProject(id));
  const app = new Hono();
  app.onError(onError);
  app.notFound(c => c.json(errorBody("not-found", "요청 경로가 없습니다"), 404));
  app.use("/api/*", localOnly(context.tauriOrigin));
  app.use("/api/*", cors(context.tauriOrigin));
  app.use("/api/*", tokenGuard(context.token));
  app.get("/api/health", c => c.json({ ok: true }));

  registerProjectRoutes(app, context);
  registerInputRoutes(app, context);
  registerVoiceRoutes(app, context);
  registerScriptRoutes(app, context);
  registerCaptionRoutes(app, context);
  registerMemeRoutes(app, context);
  registerLibraryRoutes(app, context);
  registerSystemRoutes(app, context);
  registerCarouselRoutes(app, context);
  registerMediaRoutes(app, context);
  registerFrameRoutes(app, context);
  registerRenderRoutes(app, context);
  registerOutputRoutes(app);
  registerSeparateRoutes(app, context);
  registerTranscribeRoutes(app, context);
  registerModelRoutes(app, context);
  registerEventRoutes(app, context);
  return app;
}
