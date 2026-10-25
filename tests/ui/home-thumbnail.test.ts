import { describe, expect, it } from "vitest";
import { projectThumbnailInput } from "../../src/ui/screens/home-thumbnail";
import type { Project } from "../../src/core/schema";

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "테스트",
  inputs: [
    { id: "video-1", kind: "video", file: "input/video.mov" },
    { id: "photo-1", kind: "photo", file: "input/photo.jpg" },
  ],
  timeline: { video: [], overlay: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } },
  savedAt: "2026-10-25T00:00:00.000Z",
  ...overrides,
});

describe("projectThumbnailInput", () => {
  it("uses the input referenced by the first main timeline clip", () => {
    const value = project({
      timeline: { ...project().timeline, video: [
        { id: "meme", kind: "meme", memeId: "reaction", durationSec: 2 },
        { id: "main", kind: "main", inputId: "video-1", durationSec: 4 },
      ] },
    });

    expect(projectThumbnailInput(value)).toEqual(value.inputs[0]);
  });

  it("uses the first real input when the timeline has no video clips", () => {
    expect(projectThumbnailInput(project())).toEqual(project().inputs[0]);
  });

  it("returns no input when the timeline main clip points to a missing input", () => {
    const value = project({
      timeline: { ...project().timeline, video: [{ id: "main", kind: "main", inputId: "missing", durationSec: 4 }] },
    });

    expect(projectThumbnailInput(value)).toBeNull();
  });
});
