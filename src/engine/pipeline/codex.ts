// Codex CLI 실행 경계. uUu src/pipeline/codex.ts의 인자·로그인·이벤트·파일 결과 흐름을 옮겼다.
// Claude 계정 선택, ClaudeRunner, 웹 조사, 참고 이미지 도구는 U3 범위에서 제외했다.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { CodexScript } from "../../core/schema";
import { compileCodexSchema } from "./codex-schema";

export class CodexError extends Error {
  constructor(message: string, readonly usage: Record<string, number> = {}) {
    super(message);
    this.name = "CodexError";
  }
}

const TOKEN_UNITS = ["input_tokens", "output_tokens", "cached_input_tokens", "cache_write_input_tokens", "reasoning_output_tokens"] as const;

export function parseCodexEvents(stdout: string): { usage: Record<string, number>; failed: boolean; reason: string | null; detail: string | null } {
  const usage: Record<string, number> = {};
  let failed = false;
  let reason: string | null = null;
  let detail: string | null = null;
  for (const line of stdout.split("\n")) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "turn.completed" && event.usage && typeof event.usage === "object") {
      for (const unit of TOKEN_UNITS) {
        const amount = (event.usage as Record<string, unknown>)[unit];
        if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) usage[unit] = (usage[unit] ?? 0) + amount;
      }
    }
    if (event.type === "turn.failed" || event.type === "error") {
      failed = true;
      const failure = event.error ?? event.message ?? "";
      reason = codexFailureReason(JSON.stringify(failure));
      const nested = event.error as { message?: unknown } | undefined;
      detail = typeof event.message === "string" ? event.message : typeof nested?.message === "string" ? nested.message : null;
    }
  }
  return { usage, failed, reason, detail };
}

export function codexFailureReason(text: string): string {
  if (/rate.?limit|usage.?limit|quota|limit.?reached/i.test(text)) return "사용 한도에 도달했습니다";
  if (/auth|log.?in|unauthorized|token.?expired/i.test(text)) return "Codex 로그인이 필요합니다";
  if (/unexpected argument|unknown (?:option|feature)|unsupported|unrecognized/i.test(text)) return "설치된 Codex CLI가 필요한 옵션을 지원하지 않습니다";
  return "Codex CLI 요청이 실패했습니다";
}

export function codexCliArgs(params: { schemaFile: string; outputFile: string; cwd: string; images?: readonly string[] }): string[] {
  return [
    "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
    "--disable", "apps", "--disable", "shell_tool", "--disable", "unified_exec", "--disable", "image_generation",
    "-c", "mcp_servers={}", "--json", "--output-schema", params.schemaFile,
    "--output-last-message", params.outputFile, "-C", params.cwd,
    "-m", "gpt-6-luna",
    ...(params.images ?? []).flatMap(image => ["--image", image]),
    "-",
  ];
}

export type CodexProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
  aborted: boolean;
  timedOut: boolean;
  overflow: boolean;
};
export type CodexProcessRunner = (request: {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
}) => Promise<CodexProcessResult>;
export type TranscribeInputResult = { text: string; warning?: string } | null;
export type TranscribeInput = (input: { file: string; inputId: string; signal?: AbortSignal }) => Promise<TranscribeInputResult>;

export const runCodexProcess: CodexProcessRunner = request => new Promise((resolve, reject) => {
  const child = spawn(request.bin, request.args, { cwd: request.cwd, env: request.env, stdio: ["pipe", "pipe", "pipe"] });
  const chunks: string[] = [];
  let stderr = "";
  let bytes = 0;
  let overflow = false;
  let aborted = false;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, request.timeoutMs);
  const abort = () => {
    aborted = true;
    child.kill("SIGTERM");
  };
  request.signal?.addEventListener("abort", abort, { once: true });
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 8 * 1024 * 1024) {
      overflow = true;
      child.kill("SIGTERM");
    } else chunks.push(chunk);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-32_000); });
  child.on("error", error => {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
    reject(error);
  });
  child.on("close", code => {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
    resolve({ code: code ?? -1, stdout: chunks.join(""), stderr, aborted, timedOut, overflow });
  });
  child.stdin.end(request.prompt);
});

export interface CodexRunnerOptions {
  bin: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  run?: CodexProcessRunner;
}

export function codexCliRunner(options: CodexRunnerOptions) {
  const env = { ...process.env, ...options.env };
  const run = options.run ?? runCodexProcess;
  let capabilitiesChecked = false;

  return {
    async runScript(request: {
      prompt: string;
      images?: readonly string[];
      signal?: AbortSignal;
      transcribe?: TranscribeInput;
      transcriptInputs?: { file: string; inputId: string }[];
      prepareImages?: () => Promise<string[]>;
    }) {
      const work = await mkdtemp(path.join(tmpdir(), "u3-codex-"));
      let usage: Record<string, number> = {};
      const execute = (args: string[], prompt = "", timeoutMs = 15_000) => run({
        bin: options.bin,
        args,
        cwd: work,
        env,
        prompt,
        timeoutMs,
        signal: request.signal,
      });
      try {
        if (request.signal?.aborted) throw new CodexError("Codex 요청이 취소되었습니다");
        const login = await execute(["login", "status"]);
        if (login.aborted) throw new CodexError("Codex 로그인 확인이 취소되었습니다");
        if (login.timedOut) throw new CodexError("Codex 로그인 확인 시간이 초과되었습니다");
        if (login.code !== 0 || !/^Logged in using ChatGPT\b/im.test(`${login.stdout}\n${login.stderr}`)) {
          throw new CodexError("Codex ChatGPT 로그인이 필요합니다");
        }
        if (!capabilitiesChecked) {
          const help = await execute(["exec", "--help"]);
          const flags = ["--output-schema", "--output-last-message", "--json", "--ephemeral", "--sandbox", "--image"];
          if (help.code !== 0 || !flags.every(flag => help.stdout.includes(flag))) throw new CodexError("설치된 Codex CLI가 필요한 옵션을 지원하지 않습니다");
          capabilitiesChecked = true;
        }
        const schemaFile = path.join(work, "schema.json");
        const outputFile = path.join(work, "result.json");
        const compiled = compileCodexSchema(z.toJSONSchema(CodexScript) as Record<string, unknown>);
        await writeFile(schemaFile, JSON.stringify(compiled.schema), { mode: 0o600 });
        const transcriptionTasks = request.transcribe && request.transcriptInputs
          ? request.transcriptInputs.map(input => {
            const controller = new AbortController();
            const abort = () => controller.abort();
            request.signal?.addEventListener("abort", abort, { once: true });
            const promise = request.transcribe!({ ...input, signal: controller.signal })
              .catch(error => ({ text: "", warning: error instanceof Error ? error.message : String(error) }))
              .finally(() => request.signal?.removeEventListener("abort", abort));
            return { inputId: input.inputId, controller, promise };
          })
          : [];
        let images: readonly string[];
        try {
          images = request.prepareImages ? await request.prepareImages() : request.images ?? [];
        } catch (error) {
          transcriptionTasks.forEach(task => task.controller.abort());
          throw error;
        }
        const transcriptResults = await Promise.all(transcriptionTasks.map(async task => {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const delayed = new Promise<{ text: string; warning: string }>(resolve => {
            timeout = setTimeout(() => {
              task.controller.abort();
              resolve({ text: "", warning: "프레임 추출이 끝난 뒤 60초 안에 받아 적기를 끝내지 못했습니다" });
            }, 60_000);
          });
          const result = await Promise.race([task.promise, delayed]);
          if (timeout) clearTimeout(timeout);
          return { inputId: task.inputId, result };
        }));
        const transcripts = transcriptResults.filter(item => item.result?.text).map(item => ({ inputId: item.inputId, text: item.result!.text }));
        const transcriptWarnings = transcriptResults.filter(item => item.result?.warning).map(item => ({ inputId: item.inputId, warning: item.result!.warning! }));
        const prompt = transcripts.length
          ? `${request.prompt}\n\n영상별 받아 적은 말소리:\n${transcripts.map(item => `- ${item.inputId}: ${item.text}`).join("\n")}`
          : request.prompt;
        const absoluteImages = images.map(image => path.resolve(image));
        const result = await execute(codexCliArgs({ schemaFile, outputFile, cwd: work, images: absoluteImages }), prompt, options.timeoutMs ?? 10 * 60_000);
        const events = parseCodexEvents(result.stdout);
        usage = events.usage;
        if (result.aborted) throw new CodexError("Codex 요청이 취소되었습니다", usage);
        if (result.timedOut) throw new CodexError("Codex CLI 실행 시간이 초과되었습니다", usage);
        if (result.overflow) throw new CodexError("Codex CLI 출력 크기가 제한을 넘었습니다", usage);
        if (result.code !== 0 || events.failed) {
          const detail = (events.detail ?? result.stderr).replace(/(?:\/Users\/|\/home\/)[^\s:]+/g, "[경로]").trim().slice(-300);
          throw new CodexError(`Codex ${events.reason ?? codexFailureReason(result.stderr)} (종료 코드 ${result.code})${detail ? `: ${detail}` : ""}`, usage);
        }
        const info = await stat(outputFile).catch(() => null);
        if (!info?.isFile() || info.size === 0 || info.size > 4 * 1024 * 1024) throw new CodexError("Codex 결과 파일이 없거나 크기가 맞지 않습니다", usage);
        let raw: unknown;
        try {
          raw = JSON.parse(await readFile(outputFile, "utf8"));
        } catch {
          throw new CodexError("Codex 결과 파일이 JSON이 아닙니다", usage);
        }
        const output = CodexScript.safeParse(compiled.restore(raw));
        if (!output.success) throw new CodexError("Codex 결과가 대본 스키마와 맞지 않습니다", usage);
        return { output: output.data, usage, transcriptWarnings };
      } catch (error) {
        if (error instanceof CodexError) throw error;
        throw new CodexError("Codex CLI를 실행하지 못했습니다", usage);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  };
}
