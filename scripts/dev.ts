import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = randomBytes(32).toString("hex");
const engine = spawn(process.execPath, ["--import", "tsx", "src/engine/main.ts"], {
  cwd: root,
  env: { ...process.env, U3_TOKEN: token, TAURI_ORIGIN: "http://127.0.0.1:1420" },
  stdio: ["ignore", "pipe", "inherit"],
});
const lines = createInterface({ input: engine.stdout! });
let finished = false;

function stop(code = 0): void {
  if (finished) return;
  finished = true;
  engine.kill("SIGTERM");
  vite?.kill("SIGTERM");
  process.exitCode = code;
}

let vite: ReturnType<typeof spawn> | undefined;
engine.once("error", error => {
  console.error(`엔진을 시작하지 못했습니다: ${error.message}`);
  stop(1);
});
engine.once("exit", code => {
  if (!finished) {
    console.error(`엔진이 종료되었습니다 (${code ?? "signal"})`);
    stop(code ?? 1);
  }
});
lines.once("line", line => {
  const match = /^PORT (\d+)$/.exec(line.trim());
  if (!match) {
    console.error(`엔진 시작 응답이 올바르지 않습니다: ${line}`);
    stop(1);
    return;
  }
  console.info(`엔진 연결 준비 완료 · 포트 ${match[1]}`);
  vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1"], {
    cwd: root,
    env: { ...process.env, VITE_ENGINE_PORT: match[1]!, VITE_ENGINE_TOKEN: token },
    stdio: "inherit",
  });
  vite.once("exit", code => stop(code ?? 0));
});

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
