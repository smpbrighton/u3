import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { ffprobe } from "./ffmpeg";

export interface TtsOptions {
  binary: string;
  metallib: string;
  modelDir: string;
  speaker: string;
  instruct: string;
  items: Array<{ id: string; text: string }>;
  outDir: string;
  signal?: AbortSignal;
  onProgress?: (value: number, message?: string) => void;
}

export async function runTts(options: TtsOptions): Promise<Array<{ id: string; file: string; durationSec: number }>> {
  const cancelled = () => { if (options.signal?.aborted) throw new Error("음성 만들기를 취소했습니다"); };
  cancelled();
  await mkdir(options.outDir, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.binary, ["--metallib", options.metallib, "--cache-limit-mb", "256"], { stdio: ["pipe", "pipe", "pipe"] });
      const lines = createInterface({ input: child.stdout });
      let stderr = "";
      let failure: Error | undefined;
      let completed = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill("SIGTERM");
        killTimer ??= setTimeout(() => child.kill("SIGKILL"), 1000);
        killTimer.unref();
      };
      const abort = () => { failure = new Error("음성 만들기를 취소했습니다"); stop(); };
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-12_000); });
      child.stdin.on("error", error => { failure ??= error; stop(); });
      lines.on("line", line => {
        if (failure) return;
        try {
          const event = JSON.parse(line) as { event: string; id?: string; completed?: number; total?: number; message?: string };
          if (event.event === "error") throw new Error(event.message ?? "음성 만들기에 실패했습니다");
          if (event.event === "done") completed = event.completed === options.items.length;
          if (event.event === "itemDone" || event.event === "itemStarted" || event.event === "progress") {
            const count = Math.max(0, Math.min(options.items.length, Number(event.completed) || 0));
            options.onProgress?.(count / options.items.length, `음성 만드는 중 ${count}/${options.items.length}`);
          }
        } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); stop(); }
      });
      child.on("error", error => { failure = error; });
      child.on("close", code => {
        if (killTimer) clearTimeout(killTimer);
        lines.close();
        options.signal?.removeEventListener("abort", abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`u3-tts가 실패했습니다 (종료 코드 ${code}): ${stderr.trim().slice(-500)}`));
        else if (!completed) reject(new Error("u3-tts가 완료 이벤트 없이 종료했습니다"));
        else resolve();
      });
      child.stdin.end(JSON.stringify({ model: options.modelDir, speaker: options.speaker, instruct: options.instruct, items: options.items, outDir: options.outDir }));
    });
    cancelled();
    const results = [];
    for (const item of options.items) {
      const file = path.join(options.outDir, `${item.id}.wav`);
      const probe = await ffprobe(file);
      cancelled();
      const durationSec = Number(probe.format.duration);
      if (!probe.streams.some(stream => stream.codec_type === "audio") || !Number.isFinite(durationSec) || durationSec <= 0) throw new Error("생성한 음성 파일의 길이를 확인하지 못했습니다");
      results.push({ id: item.id, file, durationSec });
    }
    return results;
  } catch (error) {
    await Promise.all(options.items.map(item => rm(path.join(options.outDir, `${item.id}.wav`), { force: true })));
    throw error;
  }
}
