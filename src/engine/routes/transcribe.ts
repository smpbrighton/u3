import type { Hono } from "hono";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { captionsFromTranscript, parseWhisperOutput, transcriptForTimeline, wordsForAudioClip } from "../../core/transcript";
import type { AudioClip } from "../../core/schema";
import { CAPTION_STYLE } from "../../core/layout";
import { loadMeasurer } from "../../core/measure-node";
import type { AppContext } from "../app";
import { done } from "../jobs";
import { HttpError, parseJson } from "../http";
import { transcribeAudio, type WhisperRunner } from "../pipeline/whisper";
import { configuredModelPath } from "../pipeline/model-paths";

const captionOptions = { style: CAPTION_STYLE, maxWidth: 920, maxLines: 2 as const };
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), inputId: z.string().min(1) }),
  z.object({ kind: z.literal("voice"), clipId: z.string().min(1) }),
]);

function within(root: string, file: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, file);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new HttpError(400, "invalid-input", "프로젝트 밖의 파일은 처리할 수 없습니다");
  return resolved;
}

export function registerTranscribeRoutes(app: Hono, context: AppContext, run?: WhisperRunner): void {
  app.post("/api/projects/:id/transcribe", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const target = await parseJson(c, targetSchema);
    const projectDir = context.store.projectDir(project.id);
    const resourceDir = context.resourceDir ?? path.join(process.cwd(), "resources");
    const whisperPath = await configuredModelPath(context.store, "whisperCli", context.whisperPath ?? process.env.U3_WHISPER_CLI ?? path.join(resourceDir, "bin/whisper-cli"));
    const vadModelPath = await configuredModelPath(context.store, "silero", context.sileroPath ?? process.env.U3_SILERO_MODEL ?? path.join(resourceDir, "models/ggml-silero-v6.2.0.bin"));
    let sourceFile: string;
    let transcriptName: string;
    if (target.kind === "source") {
      const input = project.inputs.find(item => item.id === target.inputId);
      if (!input || input.kind !== "video") throw new HttpError(404, "not-found", "영상 입력을 찾지 못했습니다");
      const separated = Boolean(project.timeline.audio.stems?.[input.id]);
      sourceFile = within(projectDir, separated ? `stems/${input.id}.voice.wav` : input.file);
      transcriptName = `${input.id}.${separated ? "voice" : "source"}.json`;
      const job = context.jobs.start({ kind: "transcribe", projectId: project.id, label: "자막 만들기", cancellable: true }, async jobContext => {
        const json = await transcribeAudio({
          file: sourceFile,
          whisperPath,
          modelPath: process.env.U3_WHISPER_MODEL ?? path.join(context.store.root, "cache/models/ggml-large-v3-turbo-q5_0.bin"),
          vadModelPath,
          signal: jobContext.signal,
          ...(run ? { run } : {}),
        });
        const result = transcriptForTimeline(project.timeline, input.id, json, loadMeasurer(), captionOptions, "whisper");
        await mkdir(path.join(projectDir, "transcripts"), { recursive: true });
        await writeFile(path.join(projectDir, "transcripts", transcriptName), `${JSON.stringify(json, null, 2)}\n`);
        jobContext.progress(1, "받아 적기 완료");
        return done({ ...result, transcript: `transcripts/${transcriptName}` });
      });
      return c.json(job, 202);
    }

    const clip = project.timeline.voice.find(item => item.id === target.clipId) as AudioClip | undefined;
    if (!clip) throw new HttpError(404, "not-found", "음성 클립을 찾지 못했습니다");
    sourceFile = within(projectDir, clip.file);
    transcriptName = `${clip.id}.json`;
    const job = context.jobs.start({ kind: "transcribe", projectId: project.id, label: "자막 만들기", cancellable: true }, async jobContext => {
      const json = await transcribeAudio({
        file: sourceFile,
        whisperPath,
        modelPath: process.env.U3_WHISPER_MODEL ?? path.join(context.store.root, "cache/models/ggml-large-v3-turbo-q5_0.bin"),
        vadModelPath,
        signal: jobContext.signal,
        ...(run ? { run } : {}),
      });
      const words = wordsForAudioClip(clip, parseWhisperOutput(json));
      const endSec = Math.max(clip.startSec + 0.01, ...words.map(word => word.end));
      const fakeTimeline = {
        ...project.timeline,
        video: [{ id: `audio-${clip.id}`, kind: "main" as const, inputId: "", inStartSec: 0, inEndSec: endSec }], overlays: [],
      };
      const built = captionsFromTranscript(fakeTimeline, "", words, loadMeasurer(), captionOptions, `whisper-${clip.id}`);
      await mkdir(path.join(projectDir, "transcripts"), { recursive: true });
      await writeFile(path.join(projectDir, "transcripts", transcriptName), `${JSON.stringify(json, null, 2)}\n`);
      jobContext.progress(1, "받아 적기 완료");
      return done({ words, captions: built.captions, replaced: built.replaced, transcript: `transcripts/${transcriptName}` });
    });
    return c.json(job, 202);
  });

  app.post("/api/projects/:id/transcribe/apply", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { captions, replaceIds } = await parseJson(c, z.object({ captions: z.array(z.object({ id: z.string(), startSec: z.number(), endSec: z.number(), text: z.string() })), replaceIds: z.array(z.string()) }));
    const requested = new Set(replaceIds);
    const valid = project.timeline.captions.filter(existing => requested.has(existing.id) && captions.some(candidate => candidate.startSec < existing.endSec && candidate.endSec > existing.startSec));
    const remove = new Set(valid.map(item => item.id));
    const timeline = { ...project.timeline, captions: [...project.timeline.captions.filter(item => !remove.has(item.id)), ...captions] };
    const saved = await context.store.saveProject({ ...project, timeline });
    return c.json({ project: saved, replaced: valid });
  });
}
