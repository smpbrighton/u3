import type { Jobs } from "./jobs";

const ENGINE_SHUTDOWN_TIMEOUT_MS = 4_000;

export function installEngineShutdown(options: {
  jobs: Pick<Jobs, "shutdown">;
  stopAccepting?: () => void;
  close?: () => Promise<void>;
}): () => Promise<void> {
  let closing: Promise<void> | null = null;
  const shutdown = () => {
    closing ??= (async () => {
      process.stdin.pause();
      options.stopAccepting?.();
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          (async () => {
            await options.jobs.shutdown();
            await options.close?.();
          })(),
          new Promise<void>(resolve => {
            // 부모 프로세스의 5초 대기 전에 엔진이 정리되도록 1초 여유를 둔다.
            timeout = setTimeout(() => process.exit(0), ENGINE_SHUTDOWN_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    })().catch(error => {
      console.error("[engine] shutdown failed", error);
      process.exitCode = 1;
    });
    return closing;
  };

  process.stdin.once("end", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  if (process.stdin.readableEnded) void shutdown();
  return shutdown;
}
