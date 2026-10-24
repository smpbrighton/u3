import type { Jobs } from "./jobs";

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
      await options.jobs.shutdown();
      await options.close?.();
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
