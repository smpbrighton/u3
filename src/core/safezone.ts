import type { LayoutElement } from "./layout";
import { CANVAS, EFFECT_MAX, SAFE_ZONE, boxBottom, boxRight, inflateForEffects, sideMarginFor, type Box } from "./geometry";

export { EFFECT_MAX, SAFE_ZONE } from "./geometry";
export type ViolationReason = "outside" | "outside-with-effects" | "overflow";
export interface Violation { sceneIndex: number; elementId: string; reason: ViolationReason; box: Box; checked: Box; message: string }
export interface SafeZoneResult { ok: boolean; violations: Violation[]; scenes: number[] }
const EPS = 1e-6;

export function insideSafeZone(box: Box): boolean {
  const margin = sideMarginFor(box);
  return box.x >= margin - EPS && box.y >= SAFE_ZONE.top - EPS && boxRight(box) <= CANVAS.width - margin + EPS && boxBottom(box) <= SAFE_ZONE.bottom + EPS;
}

function zoneText(box: Box): string {
  const margin = sideMarginFor(box);
  return `세이프존(x ${margin}~${CANVAS.width - margin}, y ${SAFE_ZONE.top}~${SAFE_ZONE.bottom})`;
}

export function checkElement(sceneIndex: number, element: LayoutElement): Violation[] {
  if (!element.critical) return [];
  const violations: Violation[] = [];
  if (element.overflow) violations.push({ sceneIndex, elementId: element.id, reason: "overflow", box: element.box, checked: element.box, message: `${element.id}: 글자가 정해진 폭·줄 수를 넘칩니다` });
  const checked = element.effects ? inflateForEffects(element.box, EFFECT_MAX) : element.box;
  if (!insideSafeZone(checked)) {
    const staticInside = insideSafeZone(element.box);
    violations.push({ sceneIndex, elementId: element.id, reason: staticInside ? "outside-with-effects" : "outside", box: element.box, checked, message: staticInside ? `${element.id}: 강조 효과(줌·흔들림)가 걸리면 ${zoneText(checked)}을 벗어납니다` : `${element.id}: ${zoneText(element.box)}을 벗어납니다` });
  }
  return violations;
}

export function checkSafeZone(elementsByScene: readonly (readonly LayoutElement[])[]): SafeZoneResult {
  const violations = elementsByScene.flatMap((elements, sceneIndex) => elements.flatMap((element) => checkElement(sceneIndex, element)));
  return { ok: violations.length === 0, violations, scenes: [...new Set(violations.map((item) => item.sceneIndex))].sort((a, b) => a - b) };
}
