import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";

export function whisperArgs(options: { model: string; vadModel: string; input: string; outputPrefix: string }): string[] {
  return ["-m", options.model, "-f", options.input, "-l", "ko", "-sns", "--vad", "-vm", options.vadModel, "-ml", "1", "-sow", "-ojf", "-of", options.outputPrefix];
}

export type WhisperRunner = (options: { bin: string; args: string[]; signal?: AbortSignal }) => Promise<void>;

export const runWhisperCli: WhisperRunner = ({ bin, args, signal }) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-12_000); });
  const abort = () => child.kill("SIGTERM");
  signal?.addEventListener("abort", abort, { once: true });
  child.on("error", error => {
    signal?.removeEventListener("abort", abort);
    reject(error);
  });
  child.on("close", code => {
    signal?.removeEventListener("abort", abort);
    if (signal?.aborted) reject(new Error("받아 적기를 취소했습니다"));
    else if (code !== 0) reject(new Error(`whisper-cli가 실패했습니다 (종료 코드 ${code}): ${stderr.trim().slice(-500)}`));
    else resolve();
  });
});

export async function transcribeAudio(options: {
  file: string;
  whisperPath: string;
  modelPath: string;
  vadModelPath: string;
  signal?: AbortSignal;
  run?: WhisperRunner;
}): Promise<unknown> {
  const work = await mkdtemp(path.join(os.tmpdir(), "u3-whisper-"));
  const wav = path.join(work, "audio.wav");
  const prefix = path.join(work, "result");
  try {
    await runFfmpeg(["-i", options.file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], options.signal);
    if (options.signal?.aborted) throw new Error("받아 적기를 취소했습니다");
    await (options.run ?? runWhisperCli)({ bin: options.whisperPath, args: whisperArgs({ model: options.modelPath, vadModel: options.vadModelPath, input: wav, outputPrefix: prefix }), signal: options.signal });
    return JSON.parse(await readFile(`${prefix}.json`, "utf8")) as unknown;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
