import { afterEach, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { capabilities, defaultDataDir, defaultOrigin, enginePlatform, exe } from "../../src/engine/platform";

afterEach(() => vi.unstubAllGlobals());
it("Mac의 기존 경로와 기능을 유지한다", () => {
  vi.stubGlobal("process", { ...process, platform: "darwin" });
  expect(enginePlatform()).toBe("darwin");
  expect(exe("whisper-cli")).toBe("whisper-cli");
  expect(defaultDataDir()).toBe(path.join(os.homedir(), "Library/Application Support/U3"));
  expect(defaultOrigin()).toBe("tauri://localhost");
  expect(capabilities()).toEqual({ tts: true });
});
it("Windows 데이터는 설치 폴더 밖에 두며 TTS를 지원하지 않는다", () => {
  vi.stubGlobal("process", { ...process, platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\한 글\\AppData\\Local" } });
  expect(enginePlatform()).toBe("win32");
  expect(exe("whisper-cli")).toBe("whisper-cli.exe");
  expect(defaultDataDir()).toBe("C:\\Users\\한 글\\AppData\\Local\\ai.brightongroup.u3");
  expect(defaultOrigin()).toBe("http://tauri.localhost");
  expect(capabilities()).toEqual({ tts: false });
});
