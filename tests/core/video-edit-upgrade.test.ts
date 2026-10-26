import { describe, expect, it } from "vitest";
import { Project, type Timeline } from "../../src/core/schema";
import { moveOverlayClipToVideo1, moveVideo1ClipToOverlay } from "../../src/core/timeline/video-track-edits";
import { timelineToRender } from "../../src/core/timeline/to-render";
import { splitOverlayClip, splitVideoClip } from "../../src/core/timeline/ops";
import { fitCaptionText } from "../../src/core/layout";

const audio = {
  source: { gain: 1, muted: false },
  voice: { gain: 1, muted: false },
  sfx: { gain: 1, muted: false },
};

const base: Timeline = {
  video: [{ id: "v1", kind: "main", inputId: "input", durationSec: 5 }],
  overlays: [],
  captions: [],
  voice: [],
  sfx: [],
  audio,
};

describe("W33 timeline data and render", () => {
  it("migrates a legacy project caption and its centered position to the first layer bottom edge", () => {
    const project = Project.parse({
      id: "p", name: "legacy", inputs: [{ id: "input", kind: "video", file: "input.mp4" }], savedAt: "2026-01-01T00:00:00.000Z",
      timeline: { ...base, captions: [{ id: "c", startSec: 1, endSec: 2, text: "옛 자막" }], captionX: 0.5, captionY: 1450 },
    });
    expect(project.timeline.captionLayers[0]).toMatchObject({ name: "자막", x: 0.5, y: expect.closeTo(1555 / 1920), main: [{ id: "c", text: "옛 자막" }], sub: [] });
    expect(JSON.stringify(project.timeline)).not.toContain('"captions"');
  });

  it("multiplies clip, caption layer, and transition opacity in render data", () => {
    const timeline = {
      ...base,
      video: [{ id: "v1", kind: "main" as const, inputId: "input", durationSec: 5, opacity: 0.5 }],
      captionLayers: [{ id: "layer", name: "자막", x: 0.5, y: 1480 / 1920, opacity: 0.5,
        style: { font: "pretendard" as const, mainSize: 56, subSize: 40, color: "#fff", textOpacity: 1, bar: true, barColor: "#000", barOpacity: 0.62 },
        main: [{ id: "c", startSec: 1, endSec: 3, text: "문구", opacity: 0.8 }], sub: [] }],
    } as Timeline;
    const render = timelineToRender(timeline);
    expect(render.video[0]).toMatchObject({ opacity: 0.5 });
    expect(render.captions[0]).toMatchObject({ opacity: 0.4, layerOpacity: 0.5, textOpacity: 1, barOpacity: 0.62 });
  });

  it("keeps visual composition order explicit", () => {
    expect(timelineToRender(base).drawOrder).toEqual(["video", "overlay", "captions", "titleBar", "watermark"]);
  });

  it("keeps opacity when moving clips between video one and overlays", () => {
    const timeline = { ...base, video: [
      { id: "v1", kind: "main" as const, inputId: "input", durationSec: 5 },
      { id: "v2", kind: "meme" as const, memeId: "m", durationSec: 2, opacity: 0.4 },
    ] };
    const movedUp = moveVideo1ClipToOverlay(timeline, "v2", []);
    expect(movedUp.overlays[0]?.[0]?.opacity).toBe(0.4);
    const movedDown = moveOverlayClipToVideo1(movedUp, "v2", 1, ["left", "right"]);
    expect(movedDown.video.find((clip) => clip.id === "v2")?.opacity).toBe(0.4);
  });

  it("keeps opacity on both pieces after splitting video and overlay clips", () => {
    const videoTimeline = { ...base, video: [{ id: "v1", kind: "main" as const, inputId: "input", durationSec: 5 }, { id: "v2", kind: "meme" as const, memeId: "m", durationSec: 4, opacity: 0.3 }] };
    expect(splitVideoClip(videoTimeline, "v2", 7, ["a", "b"]).video.filter((clip) => clip.id !== "v1").map((clip) => clip.opacity)).toEqual([0.3, 0.3]);
    const overlayTimeline = { ...base, overlays: [[{ id: "o", memeId: "m", startSec: 0, durationSec: 4, x: 0.5, y: 0.5, width: 0.6, opacity: 0.6 }]] };
    expect(splitOverlayClip(overlayTimeline, "o", 2, ["a", "b"]).overlays.flat().map((clip) => clip.opacity)).toEqual([0.6, 0.6]);
  });

  it("fits each caption font size within the same width limit", () => {
    const width = (line: string, size: number) => [...line].length * size;
    const main = fitCaptionText("가나다라마바사", 300, width, 20, 56);
    const sub = fitCaptionText("가나다라마바사", 300, width, 20, 40);
    expect(main.fontSize).toBeGreaterThan(sub.fontSize);
    expect(Math.max(...main.lines.map((line) => width(line, main.fontSize)))).toBeLessThanOrEqual(300);
    expect(Math.max(...sub.lines.map((line) => width(line, sub.fontSize)))).toBeLessThanOrEqual(300);
  });

  it("shows configured watermark and nonempty title bar by default", () => {
    const render = timelineToRender({ ...base, brand: { titleBar: { text: "상품 소개" } } }, {
      watermark: { file: "brand/logo.png", x: 0.5, y: 0.1, width: 0.2, opacity: 1 },
      titleBar: { height: 160, bgColor: "#000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#fff" },
    });
    expect(render.watermark).toMatchObject({ visible: true });
    expect(render.titleBar).toMatchObject({ visible: true, text: "상품 소개" });
    expect(timelineToRender(base, { titleBar: { height: 160, bgColor: "#000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#fff" } }).titleBar?.visible).toBe(false);
    expect(timelineToRender({ ...base, brand: { titleBar: { text: "" } } }, { watermark: { file: "", x: 0.5, y: 0.1, width: 0.2, opacity: 1 }, titleBar: { height: 160, bgColor: "#000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#fff" } }).titleBar?.visible).toBe(false);
    expect(timelineToRender(base, { titleBar: { height: 160, bgColor: "#000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#fff" } }).watermark).toBeUndefined();
  });
});
