import { describe, expect, it } from "vitest";
import type { Box } from "../../src/core/geometry";
import { createHistory } from "../../src/core/timeline/history";
import type { Timeline } from "../../src/core/schema";
import {
  limitBoxBelowTitleBar,
  normalizedToScreen,
  pickTopTarget,
  recordPreviewDrag,
  resizeNormalizedBox,
  screenToNormalized,
  snapBoxToSafeZone,
} from "../../src/core/preview-geometry";

const rect = { left: 20, top: 30, width: 540, height: 960 };
const emptyTimeline = (): Timeline => ({
  video: [], overlays: [], captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
});

describe("미리보기 편집 좌표", () => {
  it("화면 좌표와 정규화 좌표를 왕복 변환한다", () => {
    const point = { x: 0.25, y: 0.75 };
    expect(screenToNormalized(normalizedToScreen(point, rect), rect)).toEqual(point);
  });

  it("모서리 끌기로 정규화 상자의 폭을 조절하고 범위를 제한한다", () => {
    const box = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
    expect(resizeNormalizedBox(box, 54, rect.width)).toEqual({ ...box, width: 0.5 });
    expect(resizeNormalizedBox({ ...box, width: 0.95 }, 100, rect.width).width).toBe(1);
  });

  it("세이프존의 실제 경계와 오른쪽 버튼 영역에 상자를 붙인다", () => {
    const box: Box = { x: 50, y: 300, width: 400, height: 200 };
    expect(snapBoxToSafeZone({ ...box, y: 100 })).toEqual({ x: 60, y: 200, width: 400, height: 200 });
    expect(snapBoxToSafeZone({ x: 600, y: 1100, width: 400, height: 200 }).x).toBe(520);
  });

  it("자막 상자 위쪽을 타이틀 바 아래로 제한한다", () => {
    expect(limitBoxBelowTitleBar({ x: 0.2, y: 0.02, width: 0.4, height: 0.2 }, 160, 1920)).toEqual({ x: 0.2, y: 160 / 1920, width: 0.4, height: 0.2 });
  });

  it("겹친 대상 중 목록에서 가장 위에 있는 대상을 고른다", () => {
    const targets = [
      { id: "bottom", box: { x: 0, y: 0, width: 1, height: 1 } },
      { id: "top", box: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } },
    ];
    expect(pickTopTarget(targets, { x: 0.5, y: 0.5 })?.id).toBe("top");
  });

  it("끌기 확정은 실행 취소 기록을 한 건만 추가한다", () => {
    const before = emptyTimeline();
    const after = { ...before, video: [{ id: "clip", kind: "main" as const, inputId: "input", durationSec: 1 }] };
    const history = recordPreviewDrag(createHistory(before), after);
    expect(history.past).toHaveLength(1);
    expect(history.present.video[0]?.id).toBe("clip");
  });
});
