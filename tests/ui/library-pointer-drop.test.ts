import { describe, expect, it } from "vitest";
import { decidePointerDrag, resolvePointerDropTarget } from "../../src/ui/studio/library-drop";

describe("decidePointerDrag", () => {
  it("4px를 넘기 전에는 클릭으로 두고 넘으면 끌기를 시작한다", () => {
    expect(decidePointerDrag({ startX: 10, startY: 10, currentX: 14, currentY: 10 })).toEqual({ kind: "click" });
    expect(decidePointerDrag({ startX: 10, startY: 10, currentX: 14.01, currentY: 10 })).toEqual({ kind: "drag" });
    expect(decidePointerDrag({ startX: 10, startY: 10, currentX: 10, currentY: 14.01 })).toEqual({ kind: "drag" });
  });
});

describe("resolvePointerDropTarget", () => {
  const input = {
    clientX: 300,
    clientY: 220,
    previewRect: { left: 500, top: 100, right: 900, bottom: 400 },
    timelineRect: { left: 100, top: 200, right: 900, bottom: 500 },
    gridLeft: 150,
    scrollLeft: 250,
    scaleWidth: 50,
    playhead: 7,
  };

  it("편집 영역의 포인터 x를 스크롤과 확대를 반영한 초로 바꾼다", () => {
    expect(resolvePointerDropTarget(input)).toEqual({ kind: "timeline", atSec: 8 });
  });

  it("미리보기에서는 재생 헤드 시각을 쓴다", () => {
    expect(resolvePointerDropTarget({ ...input, clientX: 600, clientY: 150 })).toEqual({ kind: "preview", atSec: 7 });
  });

  it("라이브러리, Inspector, 창 밖은 추가하지 않는다", () => {
    expect(resolvePointerDropTarget({ ...input, clientX: 50, clientY: 220 })).toEqual({ kind: "none" });
    expect(resolvePointerDropTarget({ ...input, clientX: 950, clientY: 220 })).toEqual({ kind: "none" });
    expect(resolvePointerDropTarget({ ...input, clientX: 950, clientY: 700 })).toEqual({ kind: "none" });
  });
});
