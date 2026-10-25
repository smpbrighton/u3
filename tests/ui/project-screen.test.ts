import { describe, expect, it } from "vitest";
import type { Project } from "../../src/core/schema";
import { projectOpenScreen } from "../../src/ui/project-screen";

const project = (inputs: Project["inputs"], video: Project["timeline"]["video"]): Project => ({
  id: "project", name: "프로젝트", inputs, savedAt: "2026-10-24T00:00:00.000Z",
  timeline: { video, overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } },
});

describe("projectOpenScreen", () => {
  it("타임라인이 있으면 스튜디오를 연다", () => {
    expect(projectOpenScreen(project([{ id: "v", kind: "video", file: "v.mp4" }], [{ id: "clip", kind: "main", inputId: "v", inStartSec: 0, inEndSec: 1 }]))).toBe("studio");
  });

  it("미디어만 있으면 대본을 열고 미디어가 없으면 미디어 화면을 연다", () => {
    expect(projectOpenScreen(project([{ id: "v", kind: "video", file: "v.mp4" }], []))).toBe("script");
    expect(projectOpenScreen(project([{ id: "placeholder", kind: "video", file: "" }], []))).toBe("input");
  });
});
