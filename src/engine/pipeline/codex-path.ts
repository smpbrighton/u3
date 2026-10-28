import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compareVersion, isCodexOutdated } from "../../core/codex-model";
import { SPAWN_OPTIONS } from "../spawn-options";
import type { Store } from "../store";
const execFileAsync = promisify(execFile);

export async function findCodexPath(store?: Store): Promise<string | null> {
  const settings: Record<string, unknown> = await store?.readSettings().catch(() => ({})) ?? {};
  const configured = typeof settings?.codexPath === "string" ? settings.codexPath : null;
  if (configured) {
    const resolved = await resolveCodexPath(configured);
    if (resolved) return resolved;
  }
  if (process.platform !== "win32") {
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
  let found: string[] = [];
  try {
    const result = await execFileAsync("where.exe", ["codex"], { ...SPAWN_OPTIONS, timeout: 10_000 });
    found = result.stdout.trim().split(/\r?\n/);
  } catch { /* 사용자 설치 위치도 확인한다. */ }
  for (const candidate of [...found,
    ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "npm/codex.cmd")] : []),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Programs/codex/codex.exe")] : []),
  ]) {
    const resolved = await resolveCodexPath(candidate);
    if (resolved) return resolved;
  }
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
      ...SPAWN_OPTIONS, env: { ...process.env, TERM: "dumb" }, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
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
    const command = await codexCommand(bin, ["--version"]);
    const { stdout } = await execFileAsync(command.bin, command.args, { ...SPAWN_OPTIONS, timeout: 10_000 });
    return stdout.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch { return null; }
}
export async function codexLoginStatus(bin: string) {
  const version = await codexVersion(bin);
  const outdated = isCodexOutdated(version);
  try {
    const command = await codexCommand(bin, ["login", "status"]);
    const { stdout, stderr } = await execFileAsync(command.bin, command.args, { ...SPAWN_OPTIONS, timeout: 15_000 });
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

async function resolveCodexPath(candidate: string): Promise<string | null> {
  if (process.platform !== "win32") return await executable(candidate) ? candidate : null;
  if (!/\.(exe|cmd|js)$/i.test(candidate)) return null;
  try {
    if (/\.cmd$/i.test(candidate)) {
      const shim = await readFile(candidate, "utf8");
      // npm cmd-shim의 알려진 codex JS 진입점만 해석한다. shell은 실행하지 않는다.
      if (!/node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js/i.test(shim)) return null;
      const js = path.join(path.dirname(candidate), "node_modules/@openai/codex/bin/codex.js");
      await access(js);
      return js;
    }
    await access(candidate);
    return candidate;
  } catch { return null; }
}

export async function codexCommand(bin: string, args: string[]): Promise<{ bin: string; args: string[] }> {
  if (process.platform !== "win32" || !/\.(cmd|js)$/i.test(bin)) return { bin, args };
  const js = await resolveCodexPath(bin);
  if (!js) throw new Error("codex 실행 파일 경로를 설정에서 지정해 주세요");
  return { bin: process.execPath, args: [js, ...args] };
}
