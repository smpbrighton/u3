import { describe, expect, it } from "vitest";
import type { RenderTimeline } from "../../src/core/timeline/to-render";
import { hasAllRenderSources } from "../../src/ui/studio/preview-sources";

function render(overrides: Partial<RenderTimeline> = {}): RenderTimeline {
  return {
    fps: 30,
    video: [],
    overlay: [],
    captions: [],
    audio: [],
    transitions: [],
    durationInFrames: 30,
    ...overrides,
  };
}

const sources = {
  inputs: { main: "u-main" },
  overlayInputs: { overlay: "u-overlay" },
  memes: { "main-meme": "u-main-meme", "overlay-meme": "u-overlay-meme", "audio-meme": "u-audio-meme" },
  files: { "voice.wav": "u-voice" },
};

describe("미리보기 소스 준비 판정", () => {
  it("047 원본 소리·stems의 캐시 파일 URL까지 있어야 준비된다", () => {
    for (const track of ["source", "stem-voice", "stem-bg"] as const) {
      const r = render({ audio: [{ id: "a", track, inputId: "main", file: "cache/audio/a.wav", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 }] });
      expect(hasAllRenderSources(r, sources)).toBe(false);
      expect(hasAllRenderSources(r, { ...sources, files: { ...sources.files, "cache/audio/a.wav": "cache-url" } })).toBe(true);
    }
  });
  it("영상 1·영상 2, 짤, 입력, 오디오 URL이 모두 있으면 준비 완료다", () => {
    expect(hasAllRenderSources(render({
      video: [
        { id: "main", kind: "main", inputId: "main", startFrame: 0, durationInFrames: 30 },
        { id: "main-meme-clip", kind: "meme", memeId: "main-meme", startFrame: 30, durationInFrames: 30 },
      ],
      overlay: [
        { id: "overlay", kind: "video", inputId: "overlay", layer: 0, startFrame: 0, durationInFrames: 30, x: 0.5, y: 0.5, width: 0.5 },
        { id: "overlay-meme-clip", kind: "meme", memeId: "overlay-meme", layer: 1, startFrame: 0, durationInFrames: 30, x: 0.5, y: 0.5, width: 0.5 },
      ],
      audio: [
        { id: "source-audio", track: "source", inputId: "main", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 },
        { id: "meme-audio", track: "meme", inputId: "audio-meme", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 },
        { id: "voice-audio", track: "voice", file: "voice.wav", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 },
      ],
    }), sources)).toBe(true);
  });

  it("영상 1 짤 URL이 없으면 준비되지 않은 것으로 본다", () => {
    expect(hasAllRenderSources(render({
      video: [{ id: "main-meme-clip", kind: "meme", memeId: "missing-meme", startFrame: 0, durationInFrames: 30 }],
    }), sources)).toBe(false);
  });

  it("영상 2 입력 URL이 없으면 준비되지 않은 것으로 본다", () => {
    expect(hasAllRenderSources(render({
      overlay: [{ id: "overlay", kind: "video", inputId: "missing-overlay", layer: 0, startFrame: 0, durationInFrames: 30, x: 0.5, y: 0.5, width: 0.5 }],
    }), sources)).toBe(false);
  });

  it("오디오 file이 files map에 없으면 준비되지 않은 것으로 본다", () => {
    expect(hasAllRenderSources(render({
      audio: [{ id: "voice-audio", track: "voice", file: "missing.wav", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 }],
    }), sources)).toBe(false);
  });

  it("http 오디오는 자체 URL을 사용하므로 files map 없이 준비된 것으로 본다", () => {
    expect(hasAllRenderSources(render({
      audio: [{ id: "http-audio", track: "sfx", file: "https://media.example/audio.wav", startFrame: 0, durationInFrames: 30, sourceStartFrame: 0, volume: 1 }],
    }), { ...sources, files: {} })).toBe(true);
  });
});
