import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaRunner } from "../../src/engine/pipeline/ffmpeg";

describe("bundled ffmpeg execution", () => {
  it("runs configured ffmpeg and ffprobe from their binary directory", async () => {
    const calls: { file: string; options: { cwd?: string } }[] = [];
    const runner = createMediaRunner(async (file, _args, options) => {
      calls.push({ file, options });
      return { stdout: "", stderr: "" };
    });
    const ffmpeg = "/bundle/resources/node_modules/@remotion/compositor-darwin-arm64/ffmpeg";
    const ffprobe = "/bundle/resources/node_modules/@remotion/compositor-darwin-arm64/ffprobe";

    await runner.run(ffmpeg, ["-version"]);
    await runner.run(ffprobe, ["-version"]);

    expect(calls).toEqual([
      { file: ffmpeg, options: expect.objectContaining({ cwd: path.dirname(ffmpeg) }) },
      { file: ffprobe, options: expect.objectContaining({ cwd: path.dirname(ffprobe) }) },
    ]);
  });

  const bundledFfmpeg = path.resolve("node_modules/@remotion/compositor-darwin-arm64/ffmpeg");
  it.skipIf(!existsSync(bundledFfmpeg))("runs the installed compositor ffmpeg from another working directory", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "u3-ffmpeg-cwd-"));
    try {
      const runner = createMediaRunner();
      await runner.run(bundledFfmpeg, ["-version"], { cwd: directory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
