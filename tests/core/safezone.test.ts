import { describe, expect, it } from "vitest";
import { buildCaptionChunks } from "../../src/core/captions";
import { CENTER_X, inflateForEffects, maxStaticSize, RAIL_SAFE_WIDTH, SAFE_ZONE } from "../../src/core/geometry";
import {
  CAPTION_MAX_LINE_WIDTH,
  CAPTION_STYLE,
  computeLayout,
  layoutCaption,
  TITLE_MAX_LINE_WIDTH,
  type LayoutElement,
  type LayoutInput,
} from "../../src/core/layout";
import { checkElement, checkSafeZone, insideSafeZone } from "../../src/core/safezone";
import { loadMeasurer } from "../../src/core/measure";
import type { WordStamp } from "../../src/core/schema";

const m = loadMeasurer();
const capOpt = { style: CAPTION_STYLE, maxWidth: CAPTION_MAX_LINE_WIDTH, maxLines: 2 } as const;
function wordsFrom(text: string): WordStamp[] {
  let time = 0;
  return text.split(/\s+/).filter(Boolean).map((text) => {
    const start = time;
    time += [...text].length * 0.12 + 0.05;
    return { text, start, end: start + [...text].length * 0.12 };
  });
}
function normalInput(): LayoutInput { return { title: "충전기 정리 끝판왕", captions: [] }; }
function captionEl(box: LayoutElement["box"], effects = true): LayoutElement {
  return { id: "caption:0", role: "caption", box, critical: true, effects, overflow: false };
}

describe("세이프존 검사", () => {
  it("정상 제목·자막 레이아웃은 통과한다", () => {
    const layout = computeLayout(normalInput(), m);
    const legalCaption = captionEl({ x: 300, y: 1270, width: 480, height: 100 }, false);
    const result = checkSafeZone([[...layout.elements, legalCaption]]);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
  it("세이프존 밖으로 나간 핵심 요소를 거부하고 장면 번호를 돌려준다", () => {
    const box = { x: 40, y: 1300, width: 500, height: 100 };
    expect(checkElement(2, captionEl(box)).map((item) => item.reason)).toEqual(["outside"]);
    const result = checkSafeZone([[], [], [captionEl(box)]]);
    expect(result.ok).toBe(false);
    expect(result.scenes).toEqual([2]);
  });
  it("강조 효과로만 세이프존을 벗어나도 거부한다", () => {
    const box = { x: CENTER_X - 450, y: 500, width: 900, height: 120 };
    expect(insideSafeZone(box)).toBe(true);
    expect(insideSafeZone(inflateForEffects(box))).toBe(false);
    expect(checkElement(0, captionEl(box, true)).map((item) => item.reason)).toEqual(["outside-with-effects"]);
    expect(checkElement(0, captionEl(box, false))).toEqual([]);
  });
  it("박스 아래쪽이 효과만큼 넘으면 거부한다", () => {
    const box = { x: 200, y: SAFE_ZONE.bottom - 100, width: 400, height: 95 };
    expect(insideSafeZone(box)).toBe(true);
    expect(checkElement(0, captionEl(box)).map((item) => item.reason)).toEqual(["outside-with-effects"]);
  });
  it("최대 허용 폭 자막은 효과를 받아도 세이프존 안에 둔다", () => {
    const width = maxStaticSize(RAIL_SAFE_WIDTH);
    const height = 177.6;
    const widest = { x: CENTER_X - width / 2, y: 1270, width, height };
    expect(checkElement(0, captionEl(widest))).toEqual([]);
  });
  it("자막 글자 넘침을 세이프존 위반으로 보고한다", () => {
    const [chunk] = buildCaptionChunks(wordsFrom("USB-C 충전 · 무게 단 180g, 가격은?"), m, {
      style: { ...CAPTION_STYLE, fontSize: 64 }, maxWidth: 2000, maxLines: 1,
    });
    expect(chunk!.lines[0]!.width).toBeGreaterThan(900);
    const block = layoutCaption(chunk!, 0);
    expect(block.overflow).toBe(true);
    const element: LayoutElement = { id: "caption:0", role: "caption", box: block.box, critical: true, effects: true, overflow: block.overflow };
    const reasons = checkElement(3, element).map((item) => item.reason);
    expect(reasons).toContain("overflow");
    expect(reasons).toContain("outside");
  });
  it("가장 작은 글자 크기로도 두 줄에 못 들어가는 제목을 거부한다", () => {
    const layout = computeLayout({ ...normalInput(), title: "이거 하나로 자취방 충전기 대란이 완전히 끝났다는 사실을 오늘 처음 알게 된 사람들 모여라" }, m);
    expect(layout.title.overflow).toBe(true);
    const result = checkSafeZone([layout.elements]);
    expect(result.ok).toBe(false);
    expect(result.violations.some((item) => item.elementId === "title" && item.reason === "overflow")).toBe(true);
  });
  it("짧은 제목은 두 줄 안에 폭 제한을 지켜 배치한다", () => {
    const layout = computeLayout(normalInput(), m);
    expect(layout.title.overflow).toBe(false);
    expect(layout.title.lines.length).toBeLessThanOrEqual(2);
    for (const line of layout.title.lines) expect(m.width(line, { role: "display", weight: 400, fontSize: layout.title.fontSize })).toBeLessThanOrEqual(TITLE_MAX_LINE_WIDTH);
  });
});
