import { describe, expect, it } from "vitest";
import type { CodexScript, MemeMeta } from "../../src/core/schema";
import { chooseMissingInputMemes, resolveScriptMemes } from "../../src/core/script-memes";

const meme: MemeMeta = {
  id: "meme-1",
  emotion: "laugh",
  situations: [],
  importedAt: "2026-01-01T00:00:00.000Z",
  tagsConfirmed: true,
};
const secondMeme: MemeMeta = { ...meme, id: "meme-2" };

type RangedScene = Extract<CodexScript["scenes"][number], { startSec: number }>;

const scene = (overrides: Partial<RangedScene> = {}): RangedScene => ({
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
    const script: CodexScript = { scenes: [scene({ memeBefore: true }), scene({ inputIndex: 2, memeAfter: true })] };

    const result = resolveScriptMemes(script, [[meme], [meme]]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[true, false], [false, true]]);
    expect(result.memes).toEqual({ 0: meme, 1: meme });
    expect(result.missingCount).toBe(0);
  });

  it("reaction이 있는데 위치가 없으면 뒤에 두고 앞뒤가 모두 true면 순위 1·2를 쓴다", () => {
    const script: CodexScript = { scenes: [scene(), scene({ inputIndex: 2, memeBefore: true, memeAfter: true })] };

    const result = resolveScriptMemes(script, [[meme], [meme, secondMeme]]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[false, true], [true, true]]);
    expect(result.memes[1]).toBe(meme);
    expect(result.alternateMemes[1]).toBe(secondMeme);
  });

  it("같은 입력의 여러 장면에는 같은 짤 ID를 두 번 할당하지 않는다", () => {
    const script: CodexScript = { scenes: [scene({ memeAfter: true }), scene({ memeAfter: true })] };

    const result = resolveScriptMemes(script, [[meme], [meme, secondMeme]]);

    expect(Object.values(result.memes).map(({ id }) => id)).toEqual(["meme-1", "meme-2"]);
  });

  it("앞뒤를 모두 골라도 2순위가 없으면 1순위 하나만 뒤에 둔다", () => {
    const script: CodexScript = { scenes: [scene({ memeBefore: true, memeAfter: true })] };

    const result = resolveScriptMemes(script, [[meme]]);

    expect(result.script.scenes[0]).toMatchObject({ memeBefore: false, memeAfter: true });
    expect(result.alternateMemes).toEqual({});
  });

  it("reaction이 null이면 짤 없이 두고, 순위 호출 실패와 후보 없음은 실패 장면 수로 센다", () => {
    const script: CodexScript = { scenes: [scene({ reaction: null, memeBefore: true }), scene(), scene()] };

    const result = resolveScriptMemes(script, [[meme], null, undefined]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([[false, false], [false, false], [false, false]]);
    expect(result.memes).toEqual({});
    expect(result.alternateMemes).toEqual({});
    expect(result.missingCount).toBe(2);
  });
});

describe("chooseMissingInputMemes", () => {
  it("reaction null 장면만 있는 입력마다 적합도가 높은 장면 한 곳에 짤을 고른다", () => {
    const script: CodexScript = { scenes: [
      scene({ reaction: null, startSec: 0.3, endSec: 2.4 }),
      scene({ reaction: null, startSec: 2.4, endSec: 5.2 }),
      scene({ reaction: null, inputIndex: 2, startSec: 0.3, endSec: 2.4 }),
      scene({ reaction: null, inputIndex: 2, startSec: 2.4, endSec: 6.6 }),
    ] };
    const result = chooseMissingInputMemes(script, [
      { by: "rule", items: [meme] },
      { by: "jev", items: [{ meme: secondMeme, fit: 0.8 }] },
      { by: "jev", items: [{ meme, fit: 0.7 }] },
      { by: "jev", items: [{ meme: secondMeme, fit: 0.95 }] },
    ]);

    expect(result.script.scenes.map(({ memeBefore, memeAfter }) => [memeBefore, memeAfter])).toEqual([
      [false, false], [false, true], [false, false], [false, true],
    ]);
    expect(result.memes).toEqual({ 1: secondMeme, 3: secondMeme });
    expect(result.missingCount).toBe(0);
  });

  it("Jev 실패 시 입력의 마지막 장면에 후보 첫 짤을 두고 입력 안에서 중복을 막는다", () => {
    const script: CodexScript = { scenes: [
      scene({ reaction: null, startSec: 0.3, endSec: 2.4 }),
      scene({ reaction: null, startSec: 2.4, endSec: 5.2 }),
      scene({ reaction: null, inputIndex: 2, startSec: 0.3, endSec: 2.4 }),
      scene({ reaction: null, inputIndex: 2, startSec: 2.4, endSec: 6.6 }),
    ] };
    const result = chooseMissingInputMemes(script, [
      { by: "rule", items: [meme] }, { by: "rule", items: [meme] },
      { by: "rule", items: [meme] }, { by: "rule", items: [meme] },
    ]);

    expect(result.script.scenes.map(({ memeAfter }) => memeAfter)).toEqual([false, true, false, true]);
    expect(Object.values(result.memes).map(({ id }) => id)).toEqual(["meme-1", "meme-1"]);
    expect(result.missingCount).toBe(0);
  });

  it("후보가 없는 입력 장면을 누락 수에 포함한다", () => {
    const script: CodexScript = { scenes: [scene({ reaction: null })] };
    expect(chooseMissingInputMemes(script, [{ by: "rule", items: [] }]).missingCount).toBe(1);
  });
});
