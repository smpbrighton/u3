import { describe, expect, it } from "vitest";
import { decideActionMove, isSameTrackDropPosition, isUnchangedTimeline, VIDEO_TRACK_EDIT_GRID_SELECTOR, resolveVideoTrackAtPointer } from "../../src/ui/studio/video-track-drop";

describe("영상 트랙 끌기 대상 판정", () => {
  const rows = ["captions", "video-new", "video-3", "video-2", "video", "source", "voice"];
  const gridTop = 240;

  it("눈금 Grid가 먼저 있어도 편집 영역의 Grid를 선택한다", () => {
    expect(VIDEO_TRACK_EDIT_GRID_SELECTOR).toBe(".timeline-editor-edit-area .ReactVirtualized__Grid");
  });

  it("grid top 기준 포인터 y로 새 트랙과 기존 영상 행을 고른다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 + 14, gridTop, 0)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 3 + 14, gridTop, 0)).toBe("video-2");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 4 + 14, gridTop, 0)).toBe("video");
  });

  it("타임라인 스크롤 위치를 더해 보이는 행이 아닌 실제 대상 행을 찾는다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 28)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 + 14, gridTop, 28)).toBe("video-3");
  });

  it("새 영상 트랙과 영상 행의 위·아래 1px 경계를 판정한다", () => {
    const firstRowTop = gridTop + 28;
    expect(resolveVideoTrackAtPointer(rows, firstRowTop + 1, gridTop, 0)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, firstRowTop + 27, gridTop, 0)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, firstRowTop + 28 + 1, gridTop, 0)).toBe("video-3");
    expect(resolveVideoTrackAtPointer(rows, firstRowTop + 28 - 1, gridTop, 0)).toBe("video-new");
  });

  it("세로 스크롤 뒤에도 보이는 새 영상 트랙과 영상 1 행을 고른다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 28)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 3 + 14, gridTop, 28)).toBe("video");
  });

  it("같은 행과 같은 시작 시각으로 끝난 끌기를 편집 없음으로 판정한다", () => {
    expect(isSameTrackDropPosition("video-2", "video-2", 16.9, 16.9)).toBe(true);
    expect(isSameTrackDropPosition("video-2", "video-3", 16.9, 16.9)).toBe(false);
    expect(isSameTrackDropPosition("video-2", "video-2", 16.9, 17)).toBe(false);
  });

  it("계산 결과가 원래 타임라인과 같으면 라이브러리 막대를 되돌릴 수 있게 판정한다", () => {
    const original = { video: [{ id: "a" }, { id: "b" }], overlays: [] };
    expect(isUnchangedTimeline(original, { video: [{ id: "a" }, { id: "b" }], overlays: [] })).toBe(true);
    expect(isUnchangedTimeline(original, { video: [{ id: "b" }, { id: "a" }], overlays: [] })).toBe(false);
  });

  it("가로 이동 없이 영상 1에서 새 영상 트랙으로 놓으면 트랙 이동으로 판정한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video", editorRow: "video", targetRow: "video-new", sourceStart: 4, start: 4 })).toEqual({ kind: "video1-to-overlay", targetTrack: "video-new" });
  });

  it("같은 행과 같은 시각이면 막대를 복귀한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video-2", editorRow: "video-2", targetRow: "video-2", sourceStart: 4, start: 4 })).toEqual({ kind: "reset" });
  });

  it("같은 행에서 시각이 달라지면 같은 트랙 안 이동으로 판정한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video-2", editorRow: "video-2", targetRow: "video-2", sourceStart: 4, start: 5 })).toEqual({ kind: "move-overlay" });
  });

  it("대상 행을 못 찾았고 시각도 같으면 막대를 복귀한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video", editorRow: "video", targetRow: null, sourceStart: 4, start: 4 })).toEqual({ kind: "reset" });
  });

  it("묶음은 대상 행으로 함께 이동하도록 분류한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video-2", editorRow: "video-2", targetRow: "video-3", sourceStart: 4, start: 4, groupId: "group" })).toEqual({ kind: "move-group", targetTrack: "video-3" });
  });

  it("자막·오디오 행 바깥과 타임라인 밖은 영상 이동 대상으로 고르지 않는다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 7 + 1, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop - 1, gridTop, 0)).toBeNull();
  });
});

describe("가변 영상 트랙", () => {
  it("영상 10 이상도 영상 트랙과 새 트랙으로 판정한다", () => {
    expect(decideActionMove({ dragSourceTrack: "video-10", editorRow: "video-10", targetRow: "video-10", sourceStart: 2, start: 3 })).toEqual({ kind: "move-overlay" });
    expect(resolveVideoTrackAtPointer(["video-new", "video-10"], 42, 0, 0)).toBe("video-10");
  });

  it("최상위 트랙에 클립 하나뿐이면 새 트랙 드롭을 편집 없이 되돌린다", () => {
    expect(shouldResetNewTrackDrop({ overlayCount: 1, sourceTrack: "video-2", sourceClipCount: 1 })).toBe(true);
    expect(shouldResetNewTrackDrop({ overlayCount: 2, sourceTrack: "video-2", sourceClipCount: 1 })).toBe(false);
    expect(shouldResetNewTrackDrop({ overlayCount: 1, sourceTrack: "video-2", sourceClipCount: 2 })).toBe(false);
  });
});
