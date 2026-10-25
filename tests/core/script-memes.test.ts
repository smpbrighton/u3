import { describe, expect, it } from "vitest";
import type { CodexScript, MemeMeta } from "../../src/core/schema";
import { resolveScriptMemes } from "../../src/core/script-memes";

const meme: MemeMeta = {
  id: "meme-1",
  emotion: "laugh",
  situations: [],
  importedAt: "2026-01-01T00:00:00.000Z",
  tagsConfirmed: true,
};

const scene = (overrides: Partial<CodexScript["scenes"][number]> = {}): CodexScript["scenes"][number] => ({
  caption: "장면",
  inputIndex: 1,
  reaction: "웃음",
  memeBefore: false,
  memeAfter: false,
  sfxCategory: null,
  startSec: 0,
  endSec: 2,
  ...overrides,
});

describe("resolveScriptMemes", () => {
  it("reaction이 있는 장면은 Codex가 고른 위치에 랭크 1순위 짤을 둔다", () => {
    const script: CodexScript = { scenes: [scene({ memeBefore: true }), scene({ memeAfter: true })] };

    const result = resolveScriptMemes(script, [meme, meme]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[true, false], [false, true]]);
    expect(result.memes).toEqual({ 0: meme, 1: meme });
    expect(result.missingCount).toBe(0);
  });

  it("reaction이 있는데 위치가 없으면 뒤에 두고 앞뒤가 모두 true면 두 순위를 유지한다", () => {
    const script: CodexScript = { scenes: [scene(), scene({ memeBefore: true, memeAfter: true })] };

    const result = resolveScriptMemes(script, [meme, meme]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[false, true], [true, true]]);
  });

  it("reaction이 null이면 짤 없이 두고, 순위 호출 실패와 후보 없음은 실패 장면 수로 센다", () => {
    const script: CodexScript = { scenes: [scene({ reaction: null, memeBefore: true }), scene(), scene()] };

    const result = resolveScriptMemes(script, [meme, null, undefined]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[false, false], [false, false], [false, false]]);
    expect(result.memes).toEqual({});
    expect(result.missingCount).toBe(2);
  });
});
