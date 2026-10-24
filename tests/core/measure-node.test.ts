import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMeasurer } from "../../src/core/measure-node";
import { FONT_FILES } from "../../src/core/fonts";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function copyFonts(directory: string, files: readonly string[] = FONT_FILES.map(font => path.basename(font.file))): Promise<void> {
  await Promise.all(files.map(file => cp(path.join("assets/fonts", file), path.join(directory, file))));
}

describe("Node 자막 측정기 폰트 경로", () => {
  it("loads fonts from U3_FONT_DIR", async () => {
    const fontDir = await mkdtemp(path.join(os.tmpdir(), "u3-font-dir-"));
    roots.push(fontDir);
    await copyFonts(fontDir, ["Pretendard-Regular.otf"]);
    vi.stubEnv("U3_FONT_DIR", fontDir);

    expect(() => loadMeasurer()).toThrow(/Pretendard-Bold\.otf/);
  });

  it("measures text when U3_FONT_DIR contains the bundled fonts", async () => {
    const fontDir = await mkdtemp(path.join(os.tmpdir(), "u3-font-dir-complete-"));
    roots.push(fontDir);
    await copyFonts(fontDir);
    vi.stubEnv("U3_FONT_DIR", fontDir);

    expect(loadMeasurer().rawWidth("자막", { role: "body", weight: 400, fontSize: 48 })).toBeGreaterThan(0);
  });
});
