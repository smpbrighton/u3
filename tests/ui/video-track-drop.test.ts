import { describe, expect, it } from "vitest";
import { resolveVideoTrackAtPointer } from "../../src/ui/studio/video-track-drop";

describe("영상 트랙 끌기 대상 판정", () => {
  const rows = ["captions", "video-new", "video-3", "video-2", "video", "source", "voice"];
  const gridTop = 240;

  it("grid top 기준 포인터 y로 새 트랙과 기존 영상 행을 고른다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 + 14, gridTop, 0)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 3 + 14, gridTop, 0)).toBe("video-2");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 4 + 14, gridTop, 0)).toBe("video");
  });

  it("타임라인 스크롤 위치를 더해 보이는 행이 아닌 실제 대상 행을 찾는다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 28)).toBe("video-new");
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 + 14, gridTop, 28)).toBe("video-3");
  });

  it("자막·오디오 행 바깥과 타임라인 밖은 영상 이동 대상으로 고르지 않는다", () => {
    expect(resolveVideoTrackAtPointer(rows, gridTop + 14, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop + 28 * 7 + 1, gridTop, 0)).toBeNull();
    expect(resolveVideoTrackAtPointer(rows, gridTop - 1, gridTop, 0)).toBeNull();
  });
});
