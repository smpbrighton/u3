import { describe, expect, it } from "vitest";
import { resolveLibraryDropPosition } from "../../src/ui/studio/library-drop";

describe("라이브러리 드롭 위치", () => {
  const rows = ["captions", "video-new", "video-10", "video", "voice"];
  it("편집 Grid의 왼쪽 좌표와 scale로 타임라인 시각을 계산한다", () => {
    expect(resolveLibraryDropPosition({ pointerX: 180, pointerY: 270, gridLeft: 100, gridTop: 200, scrollLeft: 20, scrollTop: 28, scaleWidth: 10, rows })).toEqual({ track: "video-new", atSec: 10 });
  });
  it("세로 스크롤 위치를 반영해 영상 10 행을 찾는다", () => {
    expect(resolveLibraryDropPosition({ pointerX: 100, pointerY: 214, gridLeft: 100, gridTop: 200, scrollLeft: 0, scrollTop: 56, scaleWidth: 10, rows })).toEqual({ track: "video", atSec: 0 });
  });
});
