import { codexCommand } from "./codex-path";
import { SPAWN_OPTIONS } from "../spawn-options";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseCodexEvents, codexFailureReason, CodexModelUnavailableError } from "./codex";
import { isCodexModelUnavailable } from "../../core/codex-model";
import { ffprobe, runFfmpeg } from "./ffmpeg";

export type ImageAspect = "4:5" | "1:1" | "9:16" | "16:9";
export type ImageModel = "flare" | "sunburst";
export type ImageQuality = "low" | "medium" | "high" | "auto";

export function parseImageEvents(stdout: string): { sessionId: string | null; usage: Record<string, number>; failed: boolean; reason: string | null; detail: string | null } {
  let sessionId: string | null = null;
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line) as { type?: unknown; thread_id?: unknown };
      if (event.type === "thread.started" && typeof event.thread_id === "string" && event.thread_id) sessionId = event.thread_id;
    } catch { /* JSONL 이벤트가 아닌 줄은 무시한다. */ }
  }
  return { sessionId, ...parseCodexEvents(stdout) };
}

export function codexImageFailureMessage(events: { reason: string | null; detail: string | null }, exitCode: number): string {
  const reason = events.reason ?? codexFailureReason(events.detail ?? "");
  const detail = events.detail?.trim().slice(0, 120);
  return `Codex 요청 실패: ${reason}${detail ? ` (${detail})` : ""} (종료 코드 ${exitCode})`;
}

export function requestedImageSize(aspect: ImageAspect): { width: number; height: number } {
  if (aspect === "4:5") return { width: 1024, height: 1280 };
  if (aspect === "1:1") return { width: 1024, height: 1024 };
  if (aspect === "9:16") return { width: 1008, height: 1792 };
  return { width: 1792, height: 1008 };
}

export function normalizedImageSize(aspect: ImageAspect): { width: number; height: number } {
  if (aspect === "4:5") return { width: 1080, height: 1350 };
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function imagePrompt(input: { prompt: string; style: string; model: ImageModel; quality: ImageQuality; aspect: ImageAspect; output: string }): string {
  const size = requestedImageSize(input.aspect);
  const model = input.model === "flare" ? "Flare 빠른 모델" : "Sunburst 고품질 모델";
  return `Use the built-in image_gen tool once. Create a ${model} image at ${input.quality} quality, requested size ${size.width}×${size.height} (${input.aspect}).\n\nVisual style: ${input.style}\nImage direction: ${input.prompt}\n\n글자 없음. 글자, 숫자, 로고, 워터마크를 넣지 마세요. 배경 이미지로 사용할 그림만 만드세요. Save the resulting PNG to exactly this path: ${input.output}`;
}

export function outlinePrompt(input: { instruction: string; referenceImage?: string; model: ImageModel; quality: ImageQuality; aspect: ImageAspect; output: string }): string {
  const size = requestedImageSize(input.aspect);
  const model = input.model === "flare" ? "Flare 빠른 모델" : "Sunburst 고품질 모델";
  const reference = input.referenceImage ? `Reference image path: ${input.referenceImage}. Pass this exact file with referenced_image_paths. Do not request a prior conversation image. ` : "Edit the attached reference image. ";
  return `Use the built-in image_gen tool once. ${reference}Use ${model} at ${input.quality} quality, requested size ${size.width}×${size.height} (${input.aspect}).\n\n${input.instruction}\n\nSave the resulting PNG to exactly this path: ${input.output}`;
}

export function referencePrompt(input: { prompt: string; style: string; referenceImage: string; model: ImageModel; quality: ImageQuality; aspect: ImageAspect; output: string }): string {
  return outlinePrompt({ ...input, instruction: `Visual style: ${input.style}\nImage direction: ${input.prompt}\n\n참고 사진의 상품을 같은 상품으로 그린다(종류·색·모양·패키지 형태).\n새 글자·숫자·로고·워터마크를 만들지 않는다. 상품에 원래 있는 글자는 그대로 두되 재현은 보장하지 않는다.\n사람은 손 정도만 그리고 얼굴은 그리지 않는다.` });
}

export function validatePng(data: Buffer, aspect: ImageAspect): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) throw new Error("Codex 결과가 PNG 파일이 아닙니다");
  const width = data.readUInt32BE(16); const height = data.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new Error("PNG 크기가 올바르지 않습니다");
  const ratio = width / height; const target = aspect === "4:5" ? 4 / 5 : aspect === "1:1" ? 1 : aspect === "9:16" ? 9 / 16 : 16 / 9;
  if (Math.abs(ratio - target) / target > 0.02) throw new Error(`PNG 크기 비율이 ${aspect}와 맞지 않습니다`);
  return { width, height };
}

export async function resolveImageResult(input: { workDir: string; codexHome: string; sessionId: string | null; ignoredFiles?: readonly string[] }): Promise<string> {
  const inWork = await findPng(input.workDir, new Set(input.ignoredFiles ?? []));
  if (inWork) return inWork;
  if (!input.sessionId) throw new Error("Codex JSON 이벤트에서 session id를 찾지 못했습니다");
  const result = await findPng(path.join(input.codexHome, "generated_images", input.sessionId));
  if (!result) throw new Error(`Codex 세션 ${input.sessionId}의 generated_images에 PNG가 없습니다`);
  return result;
}

async function findPng(directory: string, ignored = new Set<string>()): Promise<string | null> {
  let files: string[];
  try { files = await readdir(directory); } catch { return null; }
  for (const name of files.sort()) {
    const file = path.join(directory, name);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && path.extname(name).toLowerCase() === ".png" && !ignored.has(path.resolve(file))) return file;
  }
  return null;
}

export interface CodexImageOptions {
  bin: string;
  model: string;
  effort: string;
  imageModel: ImageModel;
  quality: ImageQuality;
  aspect: ImageAspect;
  prompt: string;
  style: string;
  referenceImage?: string;
  instruction?: string;
  output: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type ProcessOutput = { code: number; stdout: string; stderr: string; aborted: boolean; timedOut: boolean };

export async function runCodexImage(options: CodexImageOptions): Promise<{ output: string; usage: Record<string, number> }> {
  const env = { ...process.env, ...options.env };
  const workDir = await mkdtemp(path.join(os.tmpdir(), "u3-carousel-image-"));
  const outputTemp = path.join(workDir, "result.png");
  try {
    const login = await runProcess(options.bin, ["login", "status"], workDir, env, "", 15_000, options.signal);
    if (login.code !== 0 || !/^Logged in using ChatGPT\b/im.test(`${login.stdout}\n${login.stderr}`)) throw new Error("Codex ChatGPT 로그인이 필요합니다");
    const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", "--enable", "image_generation", "-C", workDir, "-m", options.model, "-c", `model_reasoning_effort=${JSON.stringify(options.effort)}`];
    let referenceImage = options.referenceImage;
    if (referenceImage) {
      const referenceCopy = path.join(workDir, "reference.png");
      await copyFile(referenceImage, referenceCopy);
      referenceImage = referenceCopy;
      args.push(`--image=${referenceImage}`);
    }
    args.push("-");
    const prompt = options.instruction && options.referenceImage
      ? outlinePrompt({ instruction: options.instruction, referenceImage: referenceImage!, model: options.imageModel, quality: options.quality, aspect: options.aspect, output: outputTemp })
      : referenceImage
        ? referencePrompt({ prompt: options.prompt, style: options.style, referenceImage, model: options.imageModel, quality: options.quality, aspect: options.aspect, output: outputTemp })
        : imagePrompt({ prompt: options.prompt, style: options.style, model: options.imageModel, quality: options.quality, aspect: options.aspect, output: outputTemp });
    const result = await runProcess(options.bin, args, workDir, env, prompt, options.timeoutMs ?? 10 * 60_000, options.signal);
    const events = parseImageEvents(result.stdout);
    if (result.aborted || options.signal?.aborted) throw new Error("이미지 생성을 취소했습니다");
    if (result.timedOut) throw new Error("Codex 이미지 생성 시간이 초과되었습니다");
    if (result.code !== 0 || events.failed) {
      if (isCodexModelUnavailable(`${result.stderr}\n${events.detail ?? ""}\n${result.stdout}`)) throw new CodexModelUnavailableError(options.model, events.usage);
      throw new Error(codexImageFailureMessage({ reason: events.reason ?? codexFailureReason(result.stderr), detail: events.detail ?? (result.stderr.trim() || null) }, result.code));
    }
    let source: string;
    try {
      source = await resolveImageResult({ workDir, codexHome: env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), sessionId: events.sessionId, ignoredFiles: referenceImage ? [referenceImage] : [] });
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}${result.stderr.trim() ? `; Codex stderr: ${result.stderr.trim().slice(-1000)}` : ""}${result.stdout.trim() ? `; Codex output: ${result.stdout.trim().slice(-1000)}` : ""}`);
    }
    const png = await readFile(source);
    const dimensions = validatePng(png, options.aspect);
    // ffprobe confirms that the IHDR dimensions decode as an image before ffmpeg transforms it.
    const probe = await ffprobe(source);
    const stream = probe.streams.find(item => item.codec_type === "video");
    if (stream?.width !== dimensions.width || stream?.height !== dimensions.height) throw new Error("Codex 이미지 크기를 확인할 수 없습니다");
    const outputSize = normalizedImageSize(options.aspect);
    await runFfmpeg(["-i", source, "-vf", `scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=increase,crop=${outputSize.width}:${outputSize.height}`, "-frames:v", "1", "-y", options.output], options.signal);
    return { output: options.output, usage: events.usage };
  } catch (error) {
    await rm(options.output, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function runProcess(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, prompt: string, timeoutMs: number, signal?: AbortSignal): Promise<ProcessOutput> {
  const command = await codexCommand(bin, args);
  return new Promise((resolve, reject) => {
    const child = spawn(command.bin, command.args, { ...SPAWN_OPTIONS, cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = ""; let stderr = ""; let aborted = false; let timedOut = false; let overflow = false;
    const terminate = () => { try { if (process.platform === "win32") child.kill("SIGTERM"); else process.kill(-(child.pid ?? 0), "SIGTERM"); } catch { child.kill("SIGTERM"); } };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    const onAbort = () => { aborted = true; terminate(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) { overflow = true; terminate(); } });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-32_000); });
    child.on("error", error => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(error); });
    child.on("close", code => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve({ code: code ?? -1, stdout, stderr: overflow ? "Codex 출력 크기 제한 초과" : stderr, aborted, timedOut }); });
    child.stdin.end(prompt);
  });
}

