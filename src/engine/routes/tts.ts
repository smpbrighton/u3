import type { Hono } from "hono";
import { existsSync, renameSync, rmSync } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { done } from "../jobs";
import { downloadQwenTts, QWEN_TTS_MODEL_DIR, qwenTtsReady } from "../pipeline/models";
import { runTts } from "../pipeline/tts";
import { ttsSettingsOf, ttsText, type TtsResult } from "../../core/tts-clips";

export function requireHeavyMediaIdle(context: AppContext): void {
  if (context.jobs.findActive("heavy-media")) throw new HttpError(409, "heavy-media-active", "다른 작업이 끝난 뒤 시작할 수 있어요");
}

export async function ensureQwenTts(context: AppContext, signal: AbortSignal, onProgress: (progress: number) => void): Promise<string> {
  const cacheDir = path.join(context.store.root, "cache/models");
  return context.store.lock("qwen-tts-model", async () => {
    if (signal.aborted) throw new Error("TTS 모델 받기를 취소했습니다");
    if (await (context.ttsServices?.ready ?? qwenTtsReady)(cacheDir)) return path.join(cacheDir, QWEN_TTS_MODEL_DIR);
    onProgress(0);
    return (context.ttsServices?.download ?? downloadQwenTts)({ cacheDir, tokenizerPath: path.join(context.resourceDir ?? path.join(process.cwd(), "resources"), "tts/tokenizer.json"), signal, onProgress });
  });
}

async function binaryPath(context: AppContext): Promise<string> {
  const resourceDir = context.resourceDir ?? path.join(process.cwd(), "resources");
  const explicit = context.ttsPath ?? process.env.U3_TTS_CLI;
  const candidates = explicit ? [explicit] : [path.resolve(resourceDir, "../../MacOS/u3-tts"),
    path.resolve(resourceDir, "../binaries/u3-tts-aarch64-apple-darwin"), path.resolve("src-tauri/binaries/u3-tts-aarch64-apple-darwin")];
  for (const candidate of candidates) if (await stat(candidate).then(info => info.isFile()).catch(() => false)) return candidate;
  throw new HttpError(503, "tts-unavailable", "음성 도우미가 없습니다. 앱을 다시 빌드해 주세요");
}

// 파일 교체 구간에는 await가 없다. 취소 요청과 파일 교체가 서로 끼어들지 않는다.
function publish(work: string, files: Array<{ id: string; file: string; durationSec: number }>, projectDir: string): TtsResult[] {
  const changed: Array<{ destination: string; backup: string; hadPrevious: boolean }> = [];
  try {
    for (const file of files) {
      const destination = path.join(projectDir, `voice/tts-${file.id}.wav`);
      const backup = path.join(work, `${file.id}.previous.wav`);
      const hadPrevious = existsSync(destination);
      if (hadPrevious) renameSync(destination, backup);
      changed.push({ destination, backup, hadPrevious });
      renameSync(file.file, destination);
    }
    return files.map(file => ({ captionId: file.id, file: `voice/tts-${file.id}.wav`, durationSec: file.durationSec }));
  } catch (error) {
    for (const file of changed.reverse()) {
      if (file.hadPrevious) renameSync(file.backup, file.destination);
      else if (existsSync(file.destination)) renameSync(file.destination, path.join(work, path.basename(file.destination)));
    }
    throw error;
  }
}

export function registerTtsRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/tts", async c => {
    const project = await context.store.requireProject(c.req.param("id"));
    const { items } = await parseJson(c, z.object({ items: z.array(z.object({ captionId: z.string().regex(/^[A-Za-z0-9_-]+$/), text: z.string() })).min(1) }));
    if (new Set(items.map(item => item.captionId)).size !== items.length) throw new HttpError(400, "duplicate-id", "자막 id가 중복됐습니다");
    const cleaned = items.map(item => ({ id: item.captionId, text: ttsText(item.text) })).filter(item => item.text);
    if (!cleaned.length) throw new HttpError(400, "empty-text", "음성으로 만들 자막이 없습니다");
    const settings = ttsSettingsOf(await context.store.readSettings());
    const binary = await binaryPath(context);
    const projectDir = context.store.projectDir(project.id);
    requireHeavyMediaIdle(context);
    const job = context.jobs.start({ kind: "tts", projectId: project.id, label: "음성 만들기", key: "heavy-media", cancellable: true }, async ctx => {
      const modelDir = await ensureQwenTts(context, ctx.signal, progress => ctx.progress(progress * 0.3, "TTS 모델 받는 중"));
      if (ctx.signal.aborted) throw new Error("음성 만들기를 취소했습니다");
      const work = await mkdtemp(path.join(projectDir, "voice/.tts-"));
      try {
        ctx.progress(0, "음성 만들기 준비 중");
        const files = await (context.ttsServices?.run ?? runTts)({ binary, metallib: path.join(context.resourceDir ?? path.join(process.cwd(), "resources"), "tts/default.metallib"),
          modelDir, ...settings, items: cleaned, outDir: work, signal: ctx.signal,
          onProgress: (progress, message) => ctx.progress(0.3 + progress * 0.69, message ?? "음성 만드는 중") });
        if (ctx.signal.aborted) throw new Error("음성 만들기를 취소했습니다");
        return done(publish(work, files, projectDir));
      } finally { rmSync(work, { recursive: true, force: true }); }
    });
    return c.json(job, 202);
  });
}
