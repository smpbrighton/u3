import { mkdtemp, rm } from "node:fs/promises";
import type { ExecFileOptions } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaRunner } from "../../src/engine/pipeline/ffmpeg";
import { ffmpegBin, mediaPlatform } from "../helpers/media";

describe("bundled ffmpeg execution", () => {
  it("runs configured ffmpeg and ffprobe from their binary directory", async () => {
    const calls: { file: string; options: ExecFileOptions }[] = [];
    const runner = createMediaRunner(async (file, _args, options) => {
      calls.push({ file, options });
      return { stdout: "", stderr: "" };
    });
    const binDir = path.resolve("bundle/resources/node_modules", mediaPlatform.compositor);
    const ffmpeg = path.join(binDir, `ffmpeg${mediaPlatform.extension}`);
    const ffprobe = path.join(binDir, `ffprobe${mediaPlatform.extension}`);

    await runner.run(ffmpeg, ["-version"]);
    await runner.run(ffprobe, ["-version"]);

    expect(calls).toEqual([
      { file: ffmpeg, options: expect.objectContaining({ cwd: path.dirname(ffmpeg) }) },
      { file: ffprobe, options: expect.objectContaining({ cwd: path.dirname(ffprobe) }) },
    ]);
  });

  const bundledFfmpeg = ffmpegBin;
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
