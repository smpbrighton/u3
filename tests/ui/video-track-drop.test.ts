import { describe, expect, it } from "vitest";
import { isSameTrackDropPosition, VIDEO_TRACK_EDIT_GRID_SELECTOR, resolveVideoTrackAtPointer } from "../../src/ui/studio/video-track-drop";

describe("영상 트랙 끌기 대상 판정", () => {
  const rows = ["captions", "video-new", "video-3", "video-2", "video", "source", "voice"];
  const gridTop = 240;

  it("눈금 Grid가 먼저 있어도 편집 영역의 Grid를 선택한다", () => {
    expect(VIDEO_TRACK_EDIT_GRID_SELECTOR).toBe(".edit-area .ReactVirtualized__Grid");
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

  it("자막·오디오 행 바깥과 타임라인 밖은 영상 이동 대상으로 고르지 않는다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 7 + 1, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop - 1, gridTop, 0)).toBeNull();
  });
});
