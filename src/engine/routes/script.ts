import type { Hono } from "hono";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CodexScript } from "../../core/schema";
import type { AppContext } from "../app";
import { HttpError, parseJson } from "../http";
import { CodexError, codexCliRunner } from "../pipeline/codex";
import { recordUsage } from "../pipeline/usage";
import { extractFrames, frameAllocation } from "../pipeline/frames";
import { ffprobe } from "../pipeline/ffmpeg";
import { listMemes } from "../pipeline/library";
import { formatScriptInputGuide, validateScriptForInputs } from "../pipeline/script-validation";
import { inputDisplayName } from "../../core/input";
import { buildScriptPrompt, DEFAULT_SCRIPT_PROMPT } from "../../core/script-prompt";
import { buildScriptReviewPrompt, DEFAULT_SCRIPT_REVIEW_PROMPT, reviewScriptResult } from "../../core/script-review";

export function registerScriptRoutes(app: Hono, context: AppContext): void {
  app.get("/api/projects/:id/script", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    try {
      const script = JSON.parse(await readFile(path.join(context.store.projectDir(project.id), "script.json"), "utf8"));
      return c.json(CodexScript.parse(script));
    } catch {
      return c.json(null);
    }
  });

  app.put("/api/projects/:id/script", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { script } = await parseJson(c, z.object({ script: CodexScript }));
    await writeFile(path.join(context.store.projectDir(project.id), "script.json"), `${JSON.stringify(script, null, 2)}\n`);
    return c.json(script);
  });

  app.post("/api/projects/:id/script/recommend", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const request = await parseJson(c, z.object({
      mode: z.enum(["ai", "direct"]).optional(),
      prompt: z.string().optional(),
      images: z.array(z.string().min(1)).optional(),
    }));
    const mode = request.mode ?? "direct";
    const userPrompt = request.prompt?.trim();
    if (mode === "direct" && !userPrompt) throw new HttpError(400, "invalid", "직접 쓰기 모드에는 사용자 요청이 필요합니다");
    const bin = await context.codexPath();
    if (!bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");

    const job = context.jobs.enqueue("대본 추천", async ({ signal, progress }) => {
      progress(0.1, "Codex 실행 중");
      const settings = await context.store.readSettings();
      const voice = {
        speaker: typeof settings.scriptSpeaker === "string" ? settings.scriptSpeaker : "",
        tone: typeof settings.scriptTone === "string" ? settings.scriptTone : "",
        persona: typeof settings.scriptPersona === "string" ? settings.scriptPersona : "",
      };
      const inputs = await Promise.all(project.inputs.filter(input => input.id !== "placeholder").map(async input => {
        if (input.kind !== "video" || input.durationSec !== undefined) return input;
        const source = path.resolve(context.store.projectDir(project.id), input.file);
        const durationSec = Number((await ffprobe(source)).format.duration);
        if (!Number.isFinite(durationSec) || durationSec <= 0) {
          throw new Error(`${inputDisplayName(input)}의 영상 길이를 확인할 수 없습니다.`);
        }
        return { ...input, durationSec };
      }));
      const videos = inputs.filter(input => input.kind === "video");
      const counts = frameAllocation(videos.length, inputs.filter(input => input.kind === "photo").length);
      const emotions = [...new Set((await listMemes(context.resourceDir)).map(meme => meme.emotion))];
      let videoIndex = 0;
      const frameTimes = inputs.map(input => {
        if (input.kind === "photo") return ["사진"];
        const count = counts[videoIndex++] ?? 10;
        return Array.from({ length: count }, (_, frameIndex) => `${(((frameIndex + 0.5) / count) * input.durationSec!).toFixed(1)}초`);
      });
      const runner = codexCliRunner({ bin, model: typeof settings.codexModel === "string" ? settings.codexModel : "gpt-6-luna", effort: typeof settings.codexEffort === "string" ? settings.codexEffort : "medium" });
      const preparedImages: string[] = [];
      const runAndRecord = async (prompt: string, images?: readonly string[], includeTranscription = false) => {
        try {
          const result = await runner.runScript({
            images,
            prompt,
            signal,
            ...(includeTranscription ? {
              transcribe: context.transcribeInput,
              transcriptInputs: inputs.filter(input => input.kind === "video").map(input => ({
                inputId: input.id,
                file: path.resolve(context.store.projectDir(project.id), input.file),
              })),
            } : {}),
            prepareImages: async () => {
              if (images?.length) {
                preparedImages.splice(0, preparedImages.length, ...images);
                return [...images];
              }
              const files: string[] = [];
              videoIndex = 0;
              for (const input of inputs) {
                const source = path.resolve(context.store.projectDir(project.id), input.file);
                const directory = path.join(context.store.projectDir(project.id), "input", ".frames", input.id);
                await mkdir(directory, { recursive: true });
                if (input.kind === "video") {
                  const count = counts[videoIndex++] ?? 10;
                  files.push(...await extractFrames(source, directory, count));
                } else {
                  files.push(...await extractFrames(source, directory, 1, undefined, true));
                }
              }
              preparedImages.splice(0, preparedImages.length, ...files);
              return files;
            },
          });
          const tokenCount = Object.values(result.usage).reduce((total, amount) => total + amount, 0);
          if (tokenCount > 0) await recordUsage(context.store.root, "codex", tokenCount);
          return result;
        } catch (error) {
          if (error instanceof CodexError) {
            const tokenCount = Object.values(error.usage).reduce((total, amount) => total + amount, 0);
            if (tokenCount > 0) await recordUsage(context.store.root, "codex", tokenCount);
          }
          throw error;
        }
      };
      const result = await runAndRecord(buildScriptPrompt({
        mode,
        basePrompt: typeof settings.scriptPrompt === "string" && settings.scriptPrompt.trim() ? settings.scriptPrompt : DEFAULT_SCRIPT_PROMPT,
        userPrompt,
        voice,
        formatRules: formatScriptInputGuide(inputs, frameTimes, emotions),
      }), request.images, true);
      const draft = validateScriptForInputs(result.output, inputs, emotions);
      const reviewPrompt = buildScriptReviewPrompt({
        reviewPrompt: typeof settings.scriptReview === "string" && settings.scriptReview.trim() ? settings.scriptReview : DEFAULT_SCRIPT_REVIEW_PROMPT,
        draft,
        voice,
      });
      let reviewed: ReturnType<typeof reviewScriptResult>;
      let reviewResult: CodexScript | null = null;
      try {
        const review = await runAndRecord(reviewPrompt, preparedImages.length ? preparedImages : request.images);
        reviewResult = review.output;
        reviewed = reviewScriptResult(draft, review.output);
      } catch (error) {
        reviewed = reviewScriptResult(draft, null, error instanceof Error ? `자막 검수에 실패해 초안을 사용했습니다: ${error.message}` : "자막 검수에 실패해 초안을 사용했습니다.");
      }
      const script = reviewed.script;
      await mkdir(context.store.projectDir(project.id), { recursive: true });
      await writeFile(path.join(context.store.projectDir(project.id), "script.json"), `${JSON.stringify(script, null, 2)}\n`);
      progress(1, "대본 추천 완료");
      return { script, draft, reviewResult, reviewWarning: reviewed.warning, transcriptWarnings: result.transcriptWarnings };
    });
    return c.json(job, 202);
  });
}
