import type { Jobs } from "./jobs";

const ENGINE_SHUTDOWN_TIMEOUT_MS = 4_000;

function flushOutput(): Promise<void> {
  return Promise.all([
    new Promise<void>(resolve => process.stdout.write("", resolve)),
    new Promise<void>(resolve => process.stderr.write("", resolve)),
  ]).then(() => undefined);
}

export function installEngineShutdown(options: {
  jobs: Pick<Jobs, "shutdown">;
  stopAccepting?: () => void;
  close?: () => Promise<void>;
}): () => Promise<void> {
  let closing: Promise<void> | null = null;
  const shutdown = () => {
    closing ??= (async () => {
      process.stdin.pause();
      let timeout: NodeJS.Timeout | undefined;
      try {
        options.stopAccepting?.();
        await Promise.race([
          (async () => {
            await options.jobs.shutdown();
            await options.close?.();
          })(),
          new Promise<void>(resolve => {
            // 부모 프로세스의 5초 대기 전에 엔진이 정리되도록 1초 여유를 둔다.
            timeout = setTimeout(resolve, ENGINE_SHUTDOWN_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        console.error("[engine] shutdown failed", error);
        process.exitCode = 1;
      } finally {
        if (timeout) clearTimeout(timeout);
        process.removeListener("SIGTERM", onSigterm);
        await flushOutput();
        // ONNX Runtime의 정적 Env 소멸자가 C 런타임 exit()에서 abort를 낸다.
        // 정리와 출력 flush 뒤 기본 SIGTERM으로 종료한다. 종료 상태는 0이 아니라 SIGTERM이다.
        process.kill(process.pid, "SIGTERM");
      }
    })();
    return closing;
  };
  const onSigterm = () => { void shutdown(); };

  process.stdin.once("end", () => { void shutdown(); });
  process.once("SIGTERM", onSigterm);
  if (process.stdin.readableEnded) void shutdown();
  return shutdown;
}
