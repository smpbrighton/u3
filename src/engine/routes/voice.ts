import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../app";
import { HttpError } from "../http";
import { ffprobe } from "../pipeline/ffmpeg";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const AUDIO_TYPES: Record<string, string[]> = {
  ".m4a": ["audio/mp4", "audio/x-m4a", "application/octet-stream"],
  ".mp3": ["audio/mpeg", "audio/mp3", "application/octet-stream"],
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave", "application/octet-stream"],
  ".webm": ["audio/webm", "application/octet-stream"],
};

export function registerVoiceRoutes(app: Hono, context: AppContext): void {
  app.post("/api/projects/:id/voice", async c => {
    const id = c.req.param("id");
    const project = await context.store.getProject(id);
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");

    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      throw new HttpError(400, "invalid-audio", "오디오 파일을 읽지 못했습니다");
    }
    const file = body.file;
    if (!(file instanceof File)) throw new HttpError(400, "invalid-audio", "오디오 파일을 선택해 주세요");
    if (!file.size || file.size > MAX_AUDIO_BYTES) throw new HttpError(413, "audio-too-large", "오디오 파일은 200 MB 이하로 선택해 주세요");
    const extension = path.extname(file.name).toLowerCase();
    const isRecordedWebm = extension === ".webm" && body.recording === "true";
    if ((!Object.hasOwn(AUDIO_TYPES, extension) || !AUDIO_TYPES[extension]!.includes(file.type || "application/octet-stream")) && !isRecordedWebm) {
      throw new HttpError(415, "unsupported-audio", "m4a, mp3, wav 파일만 불러올 수 있어요");
    }

    const filename = `${randomBytes(8).toString("hex")}${extension}`;
    const directory = path.join(context.store.projectDir(id), "voice");
    const destination = path.join(directory, filename);
    await mkdir(directory, { recursive: true });
    await writeFile(destination, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    try {
      const probe = await ffprobe(destination);
      if (!probe.streams.some(stream => stream.codec_type === "audio")) throw new Error("오디오 스트림이 없습니다");
      const durationSec = Number(probe.format.duration ?? probe.streams.find(stream => stream.codec_type === "audio")?.duration);
      if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("오디오 길이를 확인할 수 없습니다");
      return c.json({ file: path.posix.join("voice", filename), durationSec }, 201);
    } catch {
      await rm(destination, { force: true });
      throw new HttpError(400, "invalid-audio", "파일의 오디오 형식이나 길이를 확인할 수 없습니다");
    }
  });
}
