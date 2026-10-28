import os from "node:os";
import path from "node:path";

export function enginePlatform(): "darwin" | "win32" {
  if (process.platform !== "darwin" && process.platform !== "win32") throw new Error(`지원하지 않는 플랫폼입니다: ${process.platform}`);
  return process.platform;
}
export const exe = (name: string): string => enginePlatform() === "win32" ? `${name}.exe` : name;
export const capabilities = () => ({ tts: enginePlatform() === "darwin" });
export const defaultOrigin = (): string => enginePlatform() === "win32" ? "http://tauri.localhost" : "tauri://localhost";
export function defaultDataDir(): string {
  if (enginePlatform() === "darwin") return path.join(os.homedir(), "Library/Application Support/U3");
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error("LOCALAPPDATA 경로가 없습니다");
  return path.win32.join(local, "ai.brightongroup.u3");
}
