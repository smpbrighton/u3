import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { transcribeAudio, whisperArgs } from "../../src/engine/pipeline/whisper";

describe("whisper pipeline", () => {
  it("builds the approved CLI options", () => {
    expect(whisperArgs({ model: "model.bin", vadModel: "vad.bin", input: "audio.wav", outputPrefix: "result" })).toEqual([
      "-m", "model.bin", "-f", "audio.wav", "-l", "ko", "-sns", "--vad", "-vm", "vad.bin", "-ml", "1", "-sow", "-ojf", "-of", "result",
    ]);
  });

  it("converts input, invokes a fake runner, and reads the saved JSON result", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-whisper-test-"));
    try {
      const fixture = path.resolve("tests/fixtures/project/input/ko-5s.wav");
      const json = await transcribeAudio({ file: fixture, whisperPath: "whisper-cli", modelPath: "model.bin", vadModelPath: "vad.bin", run: async ({ args }) => {
        expect(args).toContain("-l");
        expect(args[args.indexOf("-l") + 1]).toBe("ko");
        const prefix = args[args.indexOf("-of") + 1]!;
        await writeFile(`${prefix}.json`, JSON.stringify({ transcription: [{ text: "안녕하세요", offsets: { from: 0, to: 500 } }] }));
      } });
      expect(json).toMatchObject({ transcription: [{ text: "안녕하세요" }] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
