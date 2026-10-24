import type { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { AppContext } from "../app";
import { done } from "../jobs";
import { HttpError, parseJson } from "../http";
import { runFfmpeg } from "../pipeline/ffmpeg";
import { separateWav } from "../pipeline/separate";
import { configuredModelPath } from "../pipeline/model-paths";

function inputPath(projectDir: string, file: string): string {
  const resolvedRoot = path.resolve(projectDir);
  const resolved = path.resolve(resolvedRoot, file);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new HttpError(400, "invalid-input", "프로젝트 밖의 파일은 처리할 수 없습니다");
  return resolved;
}

export function registerSeparateRoutes(app: Hono, context: AppContext, separate = separateWav): void {
  app.post("/api/projects/:id/inputs/:inputId/separate", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const input = project.inputs.find(item => item.id === c.req.param("inputId"));
    if (!input || input.kind !== "video") throw new HttpError(404, "not-found", "영상 입력을 찾지 못했습니다");
    const modelPath = await configuredModelPath(context.store, "mrx", context.mrxPath ?? process.env.U3_MRX_MODEL ?? path.join(context.resourceDir ?? path.join(process.cwd(), "resources"), "models/mrx.int8.onnx"));
    const projectDir = context.store.projectDir(project.id);
    const source = inputPath(projectDir, input.file);
    const voiceRelative = `stems/${input.id}.voice.wav`;
    const bgRelative = `stems/${input.id}.bg.wav`;
    const voicePath = path.join(projectDir, voiceRelative);
    const bgPath = path.join(projectDir, bgRelative);
    const job = context.jobs.start({ kind: "separate", projectId: project.id, label: "음성 분리", cancellable: true }, async jobContext => {
      const work = await mkdtemp(path.join(os.tmpdir(), "u3-mrx-"));
      const normalized = path.join(work, "audio.wav");
      try {
        jobContext.progress(0, "오디오 준비 중");
        await runFfmpeg(["-i", source, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", normalized], jobContext.signal);
        await separate({
          modelPath,
          inputPath: normalized,
          voicePath,
          bgPath,
          signal: jobContext.signal,
          onProgress: progress => jobContext.progress(progress * 0.95, "목소리와 배경 분리 중"),
        });
        if (jobContext.signal.aborted) return { kind: "discarded", message: "음성 분리가 취소되었습니다" };
        const stems = { ...(project.timeline.audio.stems ?? {}), [input.id]: { voice: { gain: 1, muted: false }, bg: { gain: 1, muted: false } } };
        await context.store.saveProject({ ...project, timeline: { ...project.timeline, audio: { ...project.timeline.audio, stems } } });
        return done({ inputId: input.id, voice: voiceRelative, bg: bgRelative });
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    });
    return c.json(job, 202);
  });

  app.delete("/api/projects/:id/inputs/:inputId/separate", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const inputId = c.req.param("inputId");
    if (!project.timeline.audio.stems?.[inputId]) throw new HttpError(404, "not-separated", "분리 결과가 없습니다");
    const stems = { ...project.timeline.audio.stems };
    delete stems[inputId];
    const audio = { ...project.timeline.audio, stems: Object.keys(stems).length ? stems : undefined };
    await context.store.saveProject({ ...project, timeline: { ...project.timeline, audio } });
    return c.json({ inputId, reverted: true });
  });
}
