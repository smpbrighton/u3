import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { imagePrompt, outlinePrompt, parseImageEvents, requestedImageSize, resolveImageResult, validatePng } from "../../src/engine/pipeline/codex-image";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe("Codex image helpers", () => {
  it("reads the session id from the thread.started JSON event", () => {
    expect(parseImageEvents('{"type":"thread.started","thread_id":"session-1"}\n{"type":"turn.completed","usage":{"input_tokens":8}}')).toMatchObject({ sessionId: "session-1", usage: { input_tokens: 8 } });
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
    expect(imagePrompt({ prompt: "푸른 종이 질감", style: "콜라주", model: "flare", quality: "low", aspect: "1:1", output: "/tmp/slide.png" })).toContain("글자 없음");
    expect(imagePrompt({ prompt: "푸른 종이 질감", style: "콜라주", model: "flare", quality: "low", aspect: "1:1", output: "/tmp/slide.png" })).toContain("1024×1024");
  });

  it("keeps source text out of the no-text rule for AI outline edits", () => {
    const prompt = outlinePrompt({ instruction: "원본의 사람·상품·글자를 그대로 두고 손에 든 상품에만 흰 윤곽 테두리를 추가한다.", model: "flare", quality: "low", aspect: "4:5", output: "/tmp/outline.png" });
    expect(prompt).toContain("원본의 사람·상품·글자를 그대로 두고");
    expect(prompt).not.toContain("글자 없음");
  });
});
