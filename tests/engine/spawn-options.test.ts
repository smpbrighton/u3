import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { SPAWN_OPTIONS } from "../../src/engine/spawn-options";
it("모든 엔진 프로세스 호출이 콘솔 숨김 옵션을 쓴다", async () => {
  expect(SPAWN_OPTIONS.windowsHide).toBe(true);
  for (const file of ["jev-key.ts", "jev-key-win.ts", "pipeline/whisper.ts", "pipeline/tts.ts", "pipeline/codex.ts", "pipeline/codex-image.ts", "pipeline/ffmpeg.ts", "codex-settings.ts", "pipeline/codex-path.ts"]) {
    expect(await readFile(new URL(`../../src/engine/${file}`, import.meta.url), "utf8"), file).toContain("...SPAWN_OPTIONS");
  }
});
