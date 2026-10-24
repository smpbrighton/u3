import { describe, expect, it } from "vitest";
import { CENTER_X, inflateForEffects, SAFE_ZONE } from "../../src/core/geometry";
import type { LayoutElement } from "../../src/core/layout";
import { checkElement, checkSafeZone, insideSafeZone } from "../../src/core/safezone";
const element = (box: LayoutElement["box"], effects = true, overflow = false): LayoutElement => ({ id: "caption:0", role: "caption", box, critical: true, effects, overflow });
describe("세이프존 검사", () => {
  it("허용된 자막 박스를 통과시킨다", () => { const item = element({ x: 300, y: 1300, width: 480, height: 100 }, false); expect(insideSafeZone(item.box)).toBe(true); expect(checkSafeZone([[item]]).ok).toBe(true); });
  it("정지 박스가 세이프존 밖이면 거부한다", () => { expect(checkElement(2, element({ x: 40, y: 1300, width: 500, height: 100 })).map((item) => item.reason)).toContain("outside"); });
  it("효과 변환으로 벗어난 박스를 거부한다", () => { const box = { x: CENTER_X - 450, y: 500, width: 900, height: 120 }; expect(insideSafeZone(box)).toBe(true); expect(insideSafeZone(inflateForEffects(box))).toBe(false); expect(checkElement(0, element(box)).map((item) => item.reason)).toEqual(["outside-with-effects"]); });
  it("글자 넘침을 보고한다", () => { expect(checkElement(0, element({ x: 200, y: SAFE_ZONE.bottom - 100, width: 400, height: 95 }, false, true)).map((item) => item.reason)).toEqual(["overflow"]); });
});
