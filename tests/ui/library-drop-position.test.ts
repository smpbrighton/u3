import { describe, expect, it } from "vitest";
import { libraryDropRows, resolveLibraryDropPosition } from "../../src/ui/studio/library-drop";
import { Timeline } from "../../src/core/schema";

describe("라이브러리 드롭 위치", () => {
  const rows = ["captions", "video-new", "video-10", "video", "voice"];
  it("편집 Grid의 왼쪽 좌표와 scale로 타임라인 시각을 계산한다", () => {
    expect(resolveLibraryDropPosition({ pointerX: 180, pointerY: 230, gridLeft: 100, gridTop: 200, scrollLeft: 20, scrollTop: 0, scaleWidth: 10, rows })).toEqual({ track: "video-new", atSec: 10 });
  });
  it("세로 스크롤 위치를 반영해 영상 10 행을 찾는다", () => {
    expect(resolveLibraryDropPosition({ pointerX: 100, pointerY: 214, gridLeft: 100, gridTop: 200, scrollLeft: 0, scrollTop: 56, scaleWidth: 10, rows })).toEqual({ track: "video-10", atSec: 0 });
  });
  it("자막 메인·서브 행을 포함해 편집기와 같은 순서에서 드롭 대상을 찾는다", () => {
    const timeline = Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", durationSec: 5 }], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
    const ids = libraryDropRows(timeline);
    expect(ids.slice(0, 4)).toEqual(["caption-layer-1-main", "caption-layer-1-sub", "video-new", "video"]);
    expect(resolveLibraryDropPosition({ pointerX: 100, pointerY: 270, gridLeft: 100, gridTop: 200, scrollLeft: 0, scrollTop: 0, scaleWidth: 10, rows: ids })).toEqual({ track: "video-new", atSec: 0 });
  });
});
