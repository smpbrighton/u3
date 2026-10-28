import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractFrames, extractThumbnail, frameAllocation, frameCountForInputs } from "../../src/engine/pipeline/frames";

describe("frame allocation", () => {
  it("영상마다 1초당 1장을 올림하고 최소 3장·최대 10장을 배정한다", () => {
    const inputs = [0.1, 1, 2.9, 3, 3.01, 3.6, 9.7, 10, 10.01, 120].map(durationSec => ({ kind: "video" as const, durationSec }));
    expect(frameAllocation(inputs)).toEqual([3, 3, 3, 3, 4, 4, 10, 10, 10, 10]);
    expect(frameCountForInputs(inputs)).toBe(60);
  });

  it("사진에 1장을 배정하고 입력 순서를 유지한다", () => {
    const inputs = [{ kind: "video" as const, durationSec: 9.7 }, { kind: "photo" as const }, { kind: "video" as const, durationSec: 3.6 }, { kind: "photo" as const }, { kind: "video" as const, durationSec: 0.5 }];
    expect(frameAllocation(inputs)).toEqual([10, 1, 4, 1, 3]);
    expect(frameCountForInputs(inputs)).toBe(19);
  });

  it("전체 상한 없이 10초 이상 영상 20개에 200장을 배정한다", () => {
    const inputs = Array.from({ length: 20 }, (_, index) => ({ kind: "video" as const, durationSec: 10 + index }));
    expect(frameAllocation(inputs)).toEqual(Array(20).fill(10));
    expect(frameCountForInputs(inputs)).toBe(200);
  });

  it("사진 수가 늘어도 다른 영상의 장 수를 줄이지 않는다", () => {
    const inputs = [...Array.from({ length: 16 }, () => ({ kind: "video" as const, durationSec: 12 })), ...Array.from({ length: 4 }, () => ({ kind: "photo" as const }))];
    expect(frameAllocation(inputs)).toEqual([...Array(16).fill(10), 1, 1, 1, 1]);
    expect(frameCountForInputs(inputs)).toBe(164);
  });

  it("사진만 있거나 입력이 없으면 사진 수 또는 0장을 반환한다", () => {
    const photos = Array.from({ length: 20 }, () => ({ kind: "photo" as const }));
    expect(frameAllocation(photos)).toEqual(Array(20).fill(1));
    expect(frameCountForInputs(photos)).toBe(20);
    expect(frameAllocation([])).toEqual([]);
    expect(frameCountForInputs([])).toBe(0);
  });
});

describe("photo frame extraction", () => {
  it("returns one non-empty frame for a photo input", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "u3-photo-frames-"));
    const photo = path.resolve("tests/fixtures/project/input/photo.jpg");

    try {
      const frames = await extractFrames(photo, directory, 10, undefined, true);

      expect(frames).toHaveLength(1);
      expect((await stat(frames[0]!)).size).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("video thumbnails", () => {
  it("extracts the first video frame as a non-empty thumbnail", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "u3-video-thumbnail-"));
    const video = path.resolve("tests/fixtures/project/input/video.mp4");

    try {
      const thumbnail = await extractThumbnail(video, path.join(directory, "thumbnail.jpg"));
      expect((await stat(thumbnail)).size).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("frame cache", () => {
  it("줄어든 장 수를 넘는 이전 프레임을 제거하고 다른 파일은 유지한다", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "u3-frame-cache-"));
    try {
      await writeFile(path.join(directory, "frame-10.jpg"), "old frame");
      await writeFile(path.join(directory, "notes.txt"), "keep");
      const frames = await extractFrames(path.resolve("tests/fixtures/project/input/video.mp4"), directory, 3);
      expect(frames).toHaveLength(3);
      expect((await readdir(directory)).sort()).toEqual(["frame-01.jpg", "frame-02.jpg", "frame-03.jpg", "notes.txt"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
