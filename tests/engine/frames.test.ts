import { describe, expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractFrames, extractThumbnail, frameAllocation, frameCountForInputs } from "../../src/engine/pipeline/frames";

describe("frame allocation", () => {
  it("allocates one frame to each photo and ten to each video until the limit", () => {
    expect(frameCountForInputs(3)).toBe(30);
    expect(frameAllocation(3, 3)).toEqual([10, 10, 10]);
    expect(frameAllocation(5, 0)).toEqual([8, 8, 8, 8, 8]);
  });

  it("reduces video frames evenly and keeps at least three frames per video", () => {
    expect(frameAllocation(2, 34)).toEqual([3, 3]);
    expect(frameAllocation(4, 8)).toEqual([8, 8, 8, 8]);
  });

  it("rejects photo and video counts that exceed forty after minimum video frames", () => {
    expect(() => frameAllocation(7, 20)).toThrow(/40장/);
    expect(() => frameAllocation(0, 41)).toThrow(/40장/);
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
