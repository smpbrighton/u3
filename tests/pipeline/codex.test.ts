import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { codexCliArgs, codexCliRunner, parseCodexEvents, type CodexProcessRunner } from "../../src/engine/pipeline/codex";

const validScript = {
  scenes: [{
    caption: "첫 장면",
    inputIndex: 1,
    startSec: 0,
    endSec: 1,
    reaction: null,
    memeBefore: false,
    memeAfter: false,
    sfxCategory: null,
  }],
};
const success = (stdout = ""): Awaited<ReturnType<CodexProcessRunner>> => ({
  code: 0,
  stdout,
  stderr: "",
  aborted: false,
  timedOut: false,
  overflow: false,
});

describe("Codex CLI", () => {
  it("pins the Luna model, attaches images, and reads the structured output file", async () => {
    const calls: { args: string[]; prompt: string }[] = [];
    const runner: CodexProcessRunner = vi.fn(async request => {
      calls.push({ args: request.args, prompt: request.prompt });
      if (request.args[0] === "login") return success("Logged in using ChatGPT");
      if (request.args.includes("--help")) return success("--output-schema --output-last-message --json --ephemeral --sandbox --image");
      const output = request.args[request.args.indexOf("--output-last-message") + 1]!;
      await writeFile(output, JSON.stringify(validScript));
      return success(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 25, output_tokens: 12 } }));
    });
    const result = await codexCliRunner({ bin: "fake-codex", run: runner }).runScript({
      prompt: "요약 대본",
      images: ["frame.jpg"],
    });

    expect(CodexScript.parse(result.output)).toEqual(validScript);
    expect(result.usage).toEqual({ input_tokens: 25, output_tokens: 12 });
    expect(calls[2]!.args).toContain("gpt-6-luna");
    expect(calls[2]!.args).toContain("--image");
    expect(calls[2]!.args).toContain(path.resolve("frame.jpg"));
    expect(calls[2]!.prompt).toBe("요약 대본");
  });

  it("revalidates output through the U3 Zod schema", async () => {
    const runner: CodexProcessRunner = vi.fn(async request => {
      if (request.args[0] === "login") return success("Logged in using ChatGPT");
      if (request.args.includes("--help")) return success("--output-schema --output-last-message --json --ephemeral --sandbox --image");
      const output = request.args[request.args.indexOf("--output-last-message") + 1]!;
      await writeFile(output, JSON.stringify({ scenes: [{ ...validScript.scenes[0], inputIndex: 0 }] }));
      return success();
    });
    await expect(codexCliRunner({ bin: "fake-codex", run: runner }).runScript({ prompt: "대본" }))
      .rejects.toThrow("대본 스키마");
  });

  it("rejects a logged-out CLI before content execution", async () => {
    const runner: CodexProcessRunner = vi.fn(async () => success("Not logged in"));
    await expect(codexCliRunner({ bin: "fake-codex", run: runner }).runScript({ prompt: "대본" }))
      .rejects.toThrow("로그인");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("rejects API-key login and unsupported CLI options before generation", async () => {
    const apiKeyLogin: CodexProcessRunner = vi.fn(async () => success("Logged in using an API key"));
    await expect(codexCliRunner({ bin: "fake-codex", run: apiKeyLogin }).runScript({ prompt: "대본" }))
      .rejects.toThrow("로그인");
    expect(apiKeyLogin).toHaveBeenCalledTimes(1);

    let calls = 0;
    const unsupported: CodexProcessRunner = vi.fn(async request => {
      calls++;
      return request.args[0] === "login" ? success("Logged in using ChatGPT") : success("--image");
    });
    await expect(codexCliRunner({ bin: "fake-codex", run: unsupported }).runScript({ prompt: "대본" }))
      .rejects.toThrow("옵션을 지원하지 않습니다");
    expect(calls).toBe(2);
  });

  it("does not accept partial output after timeout or cancellation", async () => {
    const runner: CodexProcessRunner = vi.fn(async request => {
      if (request.args[0] === "login") return success("Logged in using ChatGPT");
      if (request.args.includes("--help")) return success("--output-schema --output-last-message --json --ephemeral --sandbox --image");
      return { ...success(), timedOut: true };
    });
    await expect(codexCliRunner({ bin: "fake-codex", run: runner }).runScript({ prompt: "대본" }))
      .rejects.toThrow("시간이 초과되었습니다");
  });

  it("parses only confirmed token totals and failure events", () => {
    const events = [
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 3 } },
      { type: "turn.completed", usage: { input_tokens: 4, output_tokens: 1 } },
      { type: "turn.failed", error: { message: "rate limit reached" } },
    ].map(event => JSON.stringify(event)).join("\n");
    expect(parseCodexEvents(events)).toEqual({
      usage: { input_tokens: 14, output_tokens: 3, cached_input_tokens: 3 },
      failed: true,
      reason: "사용 한도에 도달했습니다",
      detail: "rate limit reached",
    });
  });

  it("constructs strict output arguments with the required model", () => {
    expect(codexCliArgs({ schemaFile: "schema.json", outputFile: "output.json", cwd: "/tmp", images: ["one.jpg"] }))
      .toEqual(expect.arrayContaining(["exec", "--output-schema", "schema.json", "--image", "one.jpg", "-m", "gpt-6-luna"]));
  });

  it("passes existing absolute image paths to Codex when the data root is relative", async () => {
    const relativeRoot = path.relative(process.cwd(), await mkdtemp(path.join(os.tmpdir(), "u3-relative-data-")));
    const imagePath = path.join(relativeRoot, "projects", "test", "input", ".frames", "frame.jpg");
    const absoluteImagePath = path.resolve(imagePath);
    const calls: string[][] = [];
    try {
      await mkdir(path.dirname(absoluteImagePath), { recursive: true });
      await writeFile(absoluteImagePath, "image");
      const runner: CodexProcessRunner = vi.fn(async request => {
        calls.push(request.args);
        if (request.args[0] === "login") return success("Logged in using ChatGPT");
        if (request.args.includes("--help")) return success("--output-schema --output-last-message --json --ephemeral --sandbox --image");
        await writeFile(request.args[request.args.indexOf("--output-last-message") + 1]!, JSON.stringify(validScript));
        return success();
      });
      await codexCliRunner({ bin: "fake-codex", run: runner }).runScript({
        prompt: "대본",
        prepareImages: async () => [imagePath],
      });

      const args = calls.at(-1)!;
      const imageArgs = args.flatMap((argument, index) => argument === "--image" ? [args[index + 1]!] : []);
      expect(imageArgs).toEqual([absoluteImagePath]);
      for (const image of imageArgs) {
        expect(path.isAbsolute(image)).toBe(true);
        await expect(writeFile(path.join(path.dirname(image), ".read-check"), "ok")).resolves.toBeUndefined();
        await rm(path.join(path.dirname(image), ".read-check"));
      }
    } finally {
      await rm(path.resolve(relativeRoot), { recursive: true, force: true });
    }
  });
});
