import type { Hono } from "hono";
import { z } from "zod";
import { Speed } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { done } from "../jobs";
import { audioVersion, prepareSpeedAudio, projectAudioPath } from "../pipeline/audio-speed";
import { startHeavyMedia } from "./tts";
import { cacheKey } from "../../core/timeline/speed";
import { ffprobe } from "../pipeline/ffmpeg";

export function registerAudioRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/audio/prepare", async c => {
    const project = await context.store.requireProject(c.req.param("id"));
    const { sourceId, speed } = await parseJson(c, z.object({ sourceId: z.string().min(1), speed: Speed }));
    const input = project.inputs.find(i => i.id === sourceId);
    const voice = project.timeline.voice.find(clip => clip.file === sourceId);
    if (!input && !voice) throw new HttpError(400, "invalid-source", "프로젝트의 원본 음성을 선택해야 합니다");
    const projectDir = context.store.projectDir(project.id);
    let sourceAbs: string;
    try { sourceAbs = projectAudioPath(projectDir, input?.file ?? voice!.file); }
    catch { throw new HttpError(400, "invalid-source", "프로젝트 밖의 원본은 처리할 수 없습니다"); }
    const version = await audioVersion(sourceAbs);
    const job = await startHeavyMedia(context, { kind: "audio-speed", projectId: project.id, label: "배속 준비", cancellable: true }, async ctx => {
      ctx.progress(0, "배속 준비 중");
      if (await audioVersion(sourceAbs) !== version) throw new Error("원본 음성이 바뀌었습니다");
      if (input && !(await ffprobe(sourceAbs)).streams.some(s => s.codec_type === "audio")) return done({ key: cacheKey(sourceId, speed), version, noAudio: true });
      const result = await prepareSpeedAudio({ projectDir, sourceAbs, sourceId, speed, signal: ctx.signal });
      return done(result);
    }, c.req.raw.signal);
    return c.json(job, 202);
  });
}
