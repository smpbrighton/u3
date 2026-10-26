import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { codexCliRunner, type CodexProcessRunner } from "../../src/engine/pipeline/codex";

const success = (stdout = ""): Awaited<ReturnType<CodexProcessRunner>> => ({
  code: 0,
  stdout,
  stderr: "",
  aborted: false,
  timedOut: false,
  overflow: false,
});

function fakeCodex(output: unknown, schemaFiles: Record<string, unknown>[]): CodexProcessRunner {
  return vi.fn(async request => {
    if (request.args[0] === "login") return success("Logged in using ChatGPT");
    if (request.args.includes("--help")) return success("--output-schema --output-last-message --json --ephemeral --sandbox --image");
    const schemaPath = request.args[request.args.indexOf("--output-schema") + 1]!;
    schemaFiles.push(JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>);
    const outputPath = request.args[request.args.indexOf("--output-last-message") + 1]!;
    await writeFile(outputPath, JSON.stringify(output));
    return success();
  });
}

describe("generic Codex CLI runner", () => {
  it("validates and compiles the schema passed by the caller", async () => {
    const schema = z.object({ title: z.string(), count: z.number() });
    const schemaFiles: Record<string, unknown>[] = [];
    const result = await codexCliRunner({ bin: "fake-codex", run: fakeCodex({ title: "장면", count: 3 }, schemaFiles) })
      .run({ schema, prompt: "JSON을 만들어 주세요" });

    expect(result.output).toEqual({ title: "장면", count: 3 });
    expect(result.usage).toEqual({});
    expect(schemaFiles).toHaveLength(1);
    expect(schemaFiles[0]!.properties).toHaveProperty("title");
    expect(schemaFiles[0]!.properties).toHaveProperty("count");
    expect(schemaFiles[0]!.properties).not.toHaveProperty("scenes");
  });

  it("fails when output does not match the caller's schema", async () => {
    const schema = z.object({ title: z.string(), count: z.number() });
    const runner = codexCliRunner({ bin: "fake-codex", run: fakeCodex({ title: "장면", count: "세 개" }, []) });

    await expect(runner.run({ schema, prompt: "JSON을 만들어 주세요" }))
      .rejects.toThrow("Codex 결과가 요청한 스키마와 맞지 않습니다");
  });
});
