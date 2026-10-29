import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { formatWithOptions } from "node:util";

interface LogOptions {
  dir: string;
  maxBytes?: number;
  secrets?: () => readonly string[];
}

function redact(line: string, secrets: readonly string[]): string {
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    line = line.replaceAll(secret, "[redacted]").replaceAll(encodeURIComponent(secret), "[redacted]");
  }
  return line
    .replace(/(\bauthorization["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,}]+)/gi, "$1[redacted]")
    .replace(/(\b(?:api[_-]?key|U3_TOKEN|TYPESAFE_API_KEY|JEV_API_KEY)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,}]+)/gi, "$1[redacted]")
    .replace(/([?&](?:token|api[_-]?key)=)[^&\s"'<>]+/gi, "$1[redacted]");
}

export function createEngineLog({ dir, maxBytes = 5 * 1024 * 1024, secrets }: LogOptions) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "engine.log");
  appendFileSync(file, "", "utf8");
  const sanitize = (line: string) => redact(line, [process.env.U3_TOKEN ?? "", process.env.TYPESAFE_API_KEY ?? "", ...secrets?.() ?? []]);
  const write = (line: string) => {
    if (existsSync(file) && statSync(file).size > maxBytes) {
      rmSync(`${file}.1`, { force: true });
      renameSync(file, `${file}.1`);
    }
    appendFileSync(file, `${new Date().toISOString()} ${sanitize(line)}\n`, "utf8");
  };
  return { file, write, sanitize };
}

export function installEngineLog(options: LogOptions & { version: string }) {
  const log = createEngineLog(options);
  log.write(`[engine] 시작 U3 ${options.version} ${process.platform}`);
  if (process.env.U3_PREVIOUS_EXIT) log.write(`이전 엔진 종료: ${process.env.U3_PREVIOUS_EXIT}`);
  const format = (...values: unknown[]) => log.sanitize(formatWithOptions({ colors: false, depth: 6 }, ...values));
  for (const method of ["error", "warn"] as const) {
    const original = console[method].bind(console);
    console[method] = (...values: unknown[]) => {
      const line = format(...values);
      original(line);
      log.write(line);
    };
  }
  process.on("unhandledRejection", reason => log.write(format("[engine] unhandled rejection", reason)));
  process.on("uncaughtException", error => {
    try { log.write(format("[engine] uncaught exception", error)); }
    finally { process.exit(1); }
  });
  return log;
}
