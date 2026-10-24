import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Store } from "../store";
const execFileAsync = promisify(execFile);

export async function findCodexPath(store?: Store): Promise<string | null> {
  const settings: Record<string, unknown> = await store?.readSettings().catch(() => ({})) ?? {};
  const configured = typeof settings?.codexPath === "string" ? settings.codexPath : null;
  if (configured) return configured;
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(shell, ["-lc", "command -v codex"], { timeout: 10_000 });
    return stdout.trim().split("\n").at(-1) || null;
  } catch {
    return null;
  }
}
export async function codexLoginStatus(bin: string) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["login", "status"], { timeout: 15_000 });
    return { installed: true, loggedIn: /^Logged in using ChatGPT\b/im.test(`${stdout}\n${stderr}`) };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      installed: !missing,
      loggedIn: false,
      error: error instanceof Error ? error.message : "Codex 로그인 상태를 확인하지 못했습니다",
    };
  }
}
