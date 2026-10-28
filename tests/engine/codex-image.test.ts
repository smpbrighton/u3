import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexImageFailureMessage, imagePrompt, outlinePrompt, parseImageEvents, requestedImageSize, resolveImageResult, validatePng, normalizedImageSize, runCodexImage } from "../../src/engine/pipeline/codex-image";
import { CodexModelUnavailableError } from "../../src/engine/pipeline/codex";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe("Codex image helpers", () => {
  it.each(["stderr", "stdout"] as const)("이미지 실행도 사용자 오류 원문을 %s에서 모델 불가 오류로 분류한다", async channel => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-image-model-")); roots.push(root);
    const bin = path.join(root, "codex.mjs");
    const unavailable = `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`;
    await writeFile(bin, `#!${process.execPath}\nif (process.argv[2] === "login") console.log("Logged in using ChatGPT");\nelse { process.${channel}.write(${JSON.stringify(unavailable)}); process.exitCode = 1; }\n`, { mode: 0o755 });
    const error = await runCodexImage({ bin, model: "gpt-6-luna", effort: "medium", imageModel: "flare", quality: "low", aspect: "1:1", prompt: "배경", style: "", output: path.join(root, "result.png") }).catch(error => error);
    expect(error).toMatchObject({ name: "CodexModelUnavailableError", model: "gpt-6-luna" });
    expect(error).toBeInstanceOf(CodexModelUnavailableError);
    expect(error.message).toContain("이 계정에서 'gpt-6-luna' 모델을 쓸 수 없습니다");
  });

  it("reads the session id from the thread.started JSON event", () => {
    expect(parseImageEvents('{"type":"thread.started","thread_id":"session-1"}\n{"type":"turn.completed","usage":{"input_tokens":8}}')).toMatchObject({ sessionId: "session-1", usage: { input_tokens: 8 } });
  });

  it("keeps the Codex failure reason, limits detail length, and includes the exit code", () => {
    const events = parseImageEvents(`${JSON.stringify({ type: "turn.failed", error: { message: "render backend rejected request" } })}`);
    expect(codexImageFailureMessage(events, 17)).toBe(`Codex 요청 실패: Codex CLI 요청이 실패했습니다 (render backend rejected request) (종료 코드 17)`);
    expect(codexImageFailureMessage({ ...events, detail: "x".repeat(130) }, 4)).toBe(`Codex 요청 실패: Codex CLI 요청이 실패했습니다 (${"x".repeat(120)}) (종료 코드 4)`);
  });

  it("keeps quota and login failures as readable messages", () => {
    const quota = parseImageEvents(`${JSON.stringify({ type: "turn.failed", error: { message: "usage limit reached" } })}`);
    const login = parseImageEvents(`${JSON.stringify({ type: "error", message: "authentication token expired" })}`);
    expect(codexImageFailureMessage(quota, 1)).toContain("사용 한도에 도달했습니다");
    expect(codexImageFailureMessage(login, 1)).toContain("Codex 로그인이 필요합니다");
  });

  it("fails when the JSON events do not include a session id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-image-no-session-")); roots.push(root);
    await expect(resolveImageResult({ workDir: root, codexHome: root, sessionId: null })).rejects.toThrow(/session/i);
  });

  it("only looks in the current session folder when the working folder has no image", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-image-session-")); roots.push(root);
    const own = path.join(root, "generated_images", "session-1", "own.png");
    const other = path.join(root, "generated_images", "session-2", "other.png");
    await mkdir(path.dirname(own), { recursive: true }); await mkdir(path.dirname(other), { recursive: true });
    await writeFile(own, "own"); await writeFile(other, "other");
    expect(await resolveImageResult({ workDir: path.join(root, "work"), codexHome: root, sessionId: "session-1" })).toBe(own);
    expect(await readFile(other, "utf8")).toBe("other");
  });

  it("checks PNG signature and dimensions", () => {
    const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(1024, 16); png.writeUInt32BE(1280, 20);
    expect(validatePng(png, "4:5")).toEqual({ width: 1024, height: 1280 });
    expect(() => validatePng(Buffer.from("not png"), "4:5")).toThrow(/PNG/);
    expect(() => validatePng(png, "1:1")).toThrow(/크기/);
  });

  it("uses the requested aspect size and includes the text-free save instruction", () => {
    expect(requestedImageSize("4:5")).toEqual({ width: 1024, height: 1280 });
    expect(requestedImageSize("1:1")).toEqual({ width: 1024, height: 1024 });
    expect(requestedImageSize("9:16")).toEqual({ width: 1008, height: 1792 });
    expect(requestedImageSize("16:9")).toEqual({ width: 1792, height: 1008 });
    expect(normalizedImageSize("4:5")).toEqual({ width: 1080, height: 1350 });
    expect(normalizedImageSize("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(normalizedImageSize("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(normalizedImageSize("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(imagePrompt({ prompt: "푸른 종이 질감", style: "콜라주", model: "flare", quality: "low", aspect: "1:1", output: "/tmp/slide.png" })).toContain("글자 없음");
    expect(imagePrompt({ prompt: "푸른 종이 질감", style: "콜라주", model: "flare", quality: "low", aspect: "1:1", output: "/tmp/slide.png" })).toContain("1024×1024");
  });

  it("keeps source text out of the no-text rule for AI outline edits", () => {
    const prompt = outlinePrompt({ instruction: "원본의 사람·상품·글자를 그대로 두고 손에 든 상품에만 흰 윤곽 테두리를 추가한다.", model: "flare", quality: "low", aspect: "4:5", output: "/tmp/outline.png" });
    expect(prompt).toContain("원본의 사람·상품·글자를 그대로 두고");
    expect(prompt).not.toContain("글자 없음");
  });
});
