import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compareVersion, isCodexOutdated } from "../../core/codex-model";
import type { Store } from "../store";
const execFileAsync = promisify(execFile);

export async function findCodexPath(store?: Store): Promise<string | null> {
  const settings: Record<string, unknown> = await store?.readSettings().catch(() => ({})) ?? {};
  const configured = typeof settings?.codexPath === "string" ? settings.codexPath : null;
  if (configured && await executable(configured)) return configured;
  const shell = process.env.SHELL || "/bin/zsh";
  for (const mode of ["-lc", "-ilc"]) {
    const found = await shellCodexPath(shell, mode);
    if (found && await executable(found)) return found;
  }
  const home = os.homedir();
  const candidates = [
    path.join(home, ".codex/packages/standalone/current/bin/codex"),
    path.join(home, ".local/bin/codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex",
    ...[".npm-global/bin", ".volta/bin", ".bun/bin", "Library/pnpm"].map(dir => path.join(home, dir, "codex")),
  ];
  const nvm = path.join(home, ".nvm/versions/node");
  const versions = (await readdir(nvm).catch(() => [])).filter(version => /^v\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => compareVersion(b.slice(1), a.slice(1)));
  candidates.push(...versions.map(version => path.join(nvm, version, "bin/codex")));
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  return null;
}

async function executable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return (await stat(file)).isFile();
  } catch { return false; }
}

function shellCodexPath(shell: string, mode: string): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn(shell, [mode, "command -v codex"], {
      env: { ...process.env, TERM: "dumb" }, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-32_000); });
    child.stderr.resume();
    child.on("error", () => resolve(null));
    child.on("close", code => resolve(code === 0 ? stdout.trim().split("\n").at(-1) || null : null));
  });
}

export async function codexVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 10_000 });
    return stdout.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch { return null; }
}
export async function codexLoginStatus(bin: string) {
  const version = await codexVersion(bin);
  const outdated = isCodexOutdated(version);
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["login", "status"], { timeout: 15_000 });
    return { installed: true, loggedIn: /^Logged in using ChatGPT\b/im.test(`${stdout}\n${stderr}`), version, outdated };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      installed: !missing,
      loggedIn: false,
      version,
      outdated,
      error: error instanceof Error ? error.message : "Codex 로그인 상태를 확인하지 못했습니다",
    };
  }
}
