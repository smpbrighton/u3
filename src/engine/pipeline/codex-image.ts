import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseCodexEvents, codexFailureReason } from "./codex";
import { ffprobe, runFfmpeg } from "./ffmpeg";

export type ImageAspect = "4:5" | "1:1";
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

export function requestedImageSize(aspect: ImageAspect): { width: number; height: number } {
  return aspect === "4:5" ? { width: 1024, height: 1280 } : { width: 1024, height: 1024 };
}

export function imagePrompt(input: { prompt: string; style: string; model: ImageModel; quality: ImageQuality; aspect: ImageAspect; output: string }): string {
  const size = requestedImageSize(input.aspect);
  const model = input.model === "flare" ? "Flare 빠른 모델" : "Sunburst 고품질 모델";
  return `Use the built-in image_gen tool once. Create a ${model} image at ${input.quality} quality, requested size ${size.width}×${size.height} (${input.aspect}).\n\nVisual style: ${input.style}\nImage direction: ${input.prompt}\n\n글자 없음. 글자, 숫자, 로고, 워터마크를 넣지 마세요. 배경 이미지로 사용할 그림만 만드세요. Save the resulting PNG to exactly this path: ${input.output}`;
}

export function validatePng(data: Buffer, aspect: ImageAspect): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) throw new Error("Codex 결과가 PNG 파일이 아닙니다");
  const width = data.readUInt32BE(16); const height = data.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 16384 || height > 16384) throw new Error("PNG 크기가 올바르지 않습니다");
  const ratio = width / height; const target = aspect === "4:5" ? 4 / 5 : 1;
  if (Math.abs(ratio - target) / target > 0.02) throw new Error(`PNG 크기 비율이 ${aspect}와 맞지 않습니다`);
  return { width, height };
}

export async function resolveImageResult(input: { workDir: string; codexHome: string; sessionId: string | null }): Promise<string> {
  const inWork = await findPng(input.workDir);
  if (inWork) return inWork;
  if (!input.sessionId) throw new Error("Codex JSON 이벤트에서 session id를 찾지 못했습니다");
  const result = await findPng(path.join(input.codexHome, "generated_images", input.sessionId));
  if (!result) throw new Error(`Codex 세션 ${input.sessionId}의 generated_images에 PNG가 없습니다`);
  return result;
}

async function findPng(directory: string): Promise<string | null> {
  let files: string[];
  try { files = await readdir(directory); } catch { return null; }
  for (const name of files.sort()) {
    const file = path.join(directory, name);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && path.extname(name).toLowerCase() === ".png") return file;
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
    const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", "--enable", "image_generation", "-C", workDir, "-m", options.model, "-c", `model_reasoning_effort=${JSON.stringify(options.effort)}`, "-"];
    const prompt = imagePrompt({ prompt: options.prompt, style: options.style, model: options.imageModel, quality: options.quality, aspect: options.aspect, output: outputTemp });
    const result = await runProcess(options.bin, args, workDir, env, prompt, options.timeoutMs ?? 10 * 60_000, options.signal);
    const events = parseImageEvents(result.stdout);
    if (result.aborted || options.signal?.aborted) throw new Error("이미지 생성을 취소했습니다");
    if (result.timedOut) throw new Error("Codex 이미지 생성 시간이 초과되었습니다");
    if (result.code !== 0 || events.failed) throw new Error(`Codex ${events.reason ?? codexFailureReason(result.stderr)}${events.detail ? `: ${events.detail}` : ""}`);
    const source = await resolveImageResult({ workDir, codexHome: env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), sessionId: events.sessionId });
    const png = await readFile(source);
    const dimensions = validatePng(png, options.aspect);
    // ffprobe confirms that the IHDR dimensions decode as an image before ffmpeg transforms it.
    const probe = await ffprobe(source);
    const stream = probe.streams.find(item => item.codec_type === "video");
    if (stream?.width !== dimensions.width || stream?.height !== dimensions.height) throw new Error("Codex 이미지 크기를 확인할 수 없습니다");
    await runFfmpeg(["-i", source, "-vf", `scale=1080:${options.aspect === "4:5" ? 1350 : 1080}:force_original_aspect_ratio=increase,crop=1080:${options.aspect === "4:5" ? 1350 : 1080}`, "-frames:v", "1", "-y", options.output], options.signal);
    return { output: options.output, usage: events.usage };
  } catch (error) {
    await rm(options.output, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runProcess(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, prompt: string, timeoutMs: number, signal?: AbortSignal): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = ""; let stderr = ""; let aborted = false; let timedOut = false; let overflow = false;
    const terminate = () => { try { process.kill(-(child.pid ?? 0), "SIGTERM"); } catch { child.kill("SIGTERM"); } };
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

