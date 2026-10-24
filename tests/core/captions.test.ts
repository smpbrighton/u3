import { describe, expect, it } from "vitest";
import { buildCaptionChunks, findEmphasis } from "../../src/core/captions";
import { CAPTION_MAX_LINE_WIDTH, CAPTION_MAX_LINES, CAPTION_STYLE, fitCaptionText, wrapWords } from "../../src/core/layout";
import { MEASURE_MARGIN } from "../../src/core/measure";
import { loadMeasurer } from "../../src/core/measure-node";
import type { WordStamp } from "../../src/core/schema";

const m = loadMeasurer();
const opt = { style: CAPTION_STYLE, maxWidth: CAPTION_MAX_LINE_WIDTH, maxLines: CAPTION_MAX_LINES } as const;
function wordsFrom(text: string): WordStamp[] { let time = 0; return text.split(/\s+/).filter(Boolean).map((word) => { const start = time; time += [...word].length * 0.12 + 0.05; return { text: word, start, end: start + [...word].length * 0.12 }; }); }
const LONG = "자취 3년 차인데 이거 없었으면 진짜 큰일 날 뻔했어요 밤마다 충전기 찾느라 침대 밑을 뒤졌거든요 그러다 친구 집에서 이걸 봤는데 USB-C 충전에 무게는 단 180g 가격은 커피 두 잔 값이라 바로 주문했고 책상 위가 이렇게 깔끔해질 줄은 정말 몰랐어요 케이블 정리 고민이면 한 번 써 보세요";

describe("measure", () => {
  it("안전 여유를 곱해 잰다", () => { const raw = m.rawWidth("가격은?", CAPTION_STYLE); expect(raw).toBeGreaterThan(0); expect(m.width("가격은?", CAPTION_STYLE)).toBeCloseTo(raw * (1 + MEASURE_MARGIN), 6); });
  it("letterSpacing은 글자마다 더한다", () => { const base = m.rawWidth("abc", CAPTION_STYLE); expect(m.rawWidth("abc", { ...CAPTION_STYLE, letterSpacing: 2 })).toBeCloseTo(base + 6, 6); });
});

describe("caption line wrapping", () => {
  it("wraps a long unbroken word into at most two lines", () => {
    expect(wrapWords("가나다라마바사", 50, 2, (text) => [...text].length * 10)).toEqual(["가나다", "라마바사"]);
  });

  it("reduces a long caption to two measured lines", () => {
    const text = "원본 영상과 사진을 찾지 못해 장면별 대본을 추천할 수 없습니다. 영상과 사진을 다시 첨부해 주세요.";
    const fit = fitCaptionText(text, CAPTION_MAX_LINE_WIDTH, (line, fontSize) => m.width(line, { ...CAPTION_STYLE, fontSize }));
    expect(fit.lines).toHaveLength(2);
    expect(fit.fontSize).toBeLessThan(CAPTION_STYLE.fontSize);
    expect(fit.lines.every((line) => m.width(line, { ...CAPTION_STYLE, fontSize: fit.fontSize }) <= CAPTION_MAX_LINE_WIDTH)).toBe(true);
  });
});
describe("자막 조각", () => {
  const words = wordsFrom(LONG);
  const chunks = buildCaptionChunks(words, m, opt);
  it("모든 조각은 2줄 이하이고 폭 제한 안에 든다", () => { expect(chunks.length).toBeGreaterThan(3); for (const chunk of chunks) { expect(chunk.lines.length).toBeLessThanOrEqual(2); expect(chunk.overflow).toBe(false); for (const line of chunk.lines) { expect(line.width).toBeLessThanOrEqual(CAPTION_MAX_LINE_WIDTH); expect(m.width(line.text, CAPTION_STYLE)).toBeCloseTo(line.width, 6); } } });
  it("단어를 순서대로 한 번씩만 쓴다", () => { expect(chunks.flatMap((chunk) => chunk.lines.flatMap((line) => line.wordIndices))).toEqual(words.map((_, index) => index)); });
  it("시작은 첫 단어, 끝은 다음 조각의 시작이다", () => { chunks.forEach((chunk, index) => { expect(chunk.startSec).toBe(words[chunk.firstWord]!.start); expect(chunk.endSec).toBe(chunks[index + 1]?.startSec ?? words.at(-1)!.end); }); });
  it("문장 끝에서 조각을 끊는다", () => { expect(buildCaptionChunks(wordsFrom("안녕하세요. 반갑습니다"), m, opt).map((chunk) => chunk.lines.map((line) => line.text).join(" "))).toEqual(["안녕하세요.", "반갑습니다"]); });
  it("두 줄의 폭을 균형 있게 나눈다", () => { for (const chunk of chunks.filter((item) => item.lines.length === 2)) expect(Math.max(chunk.lines[0]!.width, chunk.lines[1]!.width) / Math.min(chunk.lines[0]!.width, chunk.lines[1]!.width)).toBeLessThan(3); });
  it("한 단어가 폭을 넘으면 overflow를 표시한다", () => { const result = buildCaptionChunks(wordsFrom("가나다라마바사아자차카타파하가나다라마바사"), m, opt); expect(result).toHaveLength(1); expect(result[0]!.overflow).toBe(true); });
});
describe("강조 단어 찾기", () => {
  const words = wordsFrom("USB-C 충전 · 무게 단 180g, 가격은?");
  it("조사·문장부호가 붙은 단어를 찾는다", () => { const result = findEmphasis(words, ["가격"]); expect(result.missing).toEqual([]); expect(result.hits[0]!.wordIndices).toEqual([6]); expect(result.hits[0]!.startSec).toBe(words[6]!.start); });
  it("두 단어를 가로지르는 강조를 찾고 시각 순으로 정렬한다", () => { const result = findEmphasis(words, ["가격", "단 180g", "usb-c"]); expect(result.hits.map((hit) => hit.term)).toEqual(["usb-c", "단 180g", "가격"]); expect(result.hits[1]!.wordIndices).toEqual([4, 5]); });
  it("못 찾은 강조 단어를 missing으로 돌려준다", () => { const result = findEmphasis(words, ["배터리", "무게"]); expect(result.hits.map((hit) => hit.term)).toEqual(["무게"]); expect(result.missing).toEqual(["배터리"]); });
});
