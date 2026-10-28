import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CodexError, CodexModelUnavailableError, codexCliRunner, codexFailureReason, type CodexProcessRunner } from "../../src/engine/pipeline/codex";

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
  const unavailable = `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`;

  it.each(["stderr", "stdout"] as const)("사용자 오류 원문을 %s에서 모델 불가 오류로 분류한다", async channel => {
    const run: CodexProcessRunner = async request => {
      if (request.args[0] === "login") return success("Logged in using ChatGPT");
      if (request.args.includes("--help")) return success("--output-schema --json --ephemeral --sandbox --image");
      const usage = JSON.stringify({ type: "turn.completed", usage: { input_tokens: 7 } });
      return { ...success(usage), code: 1, [channel]: channel === "stdout" ? `${usage}\n${unavailable}` : unavailable };
    };
    const error = await codexCliRunner({ bin: "fake-codex", model: "gpt-6-luna", run }).run({ schema: z.object({ title: z.string() }), prompt: "제목" }).catch(error => error);
    expect(error).toMatchObject({ name: "CodexModelUnavailableError", model: "gpt-6-luna", usage: { input_tokens: 7 } });
    expect(error).toBeInstanceOf(CodexModelUnavailableError);
    expect(error.message).toContain("이 계정에서 'gpt-6-luna' 모델을 쓸 수 없습니다");
  });

  it("모델 불가와 사용 한도 오류를 구분한다", async () => {
    expect(codexFailureReason(unavailable)).toBe("이 계정에서 'gpt-6-luna' 모델을 쓸 수 없습니다");
    const run: CodexProcessRunner = async request => request.args[0] === "login" ? success("Logged in using ChatGPT")
      : request.args.includes("--help") ? success("--output-schema --json --ephemeral --sandbox --image")
      : { ...success(), code: 1, stderr: "usage limit reached" };
    const error = await codexCliRunner({ bin: "fake-codex", model: "gpt-6-luna", run }).run({ schema: z.object({ title: z.string() }), prompt: "제목" }).catch(error => error);
    expect(error).toBeInstanceOf(CodexError);
    expect(error.name).toBe("CodexError");
    expect(error.message).toContain("사용 한도");
  });

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
