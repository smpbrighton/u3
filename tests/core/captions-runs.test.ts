import { describe, expect, it } from "vitest";
import { captionRuns, escapeCaptionStars, plainCaptionText } from "../../src/core/captions";
import { CAPTION_HIGHLIGHT_DEFAULT, TextClip, Timeline } from "../../src/core/schema";
import { ttsText } from "../../src/core/tts-clips";

describe("자막 별표 표기", () => {
  it("여러 강조 구간과 줄바꿈을 분해한다", () => {
    expect(captionRuns("앞 *단어* 중간 *두\n줄* 끝")).toEqual([
      { text: "앞 ", highlight: false }, { text: "단어", highlight: true },
      { text: " 중간 ", highlight: false }, { text: "두\n줄", highlight: true }, { text: " 끝", highlight: false },
    ]);
    expect(plainCaptionText("앞 *단어* 중간 *두\n줄* 끝")).toBe("앞 단어 중간 두\n줄 끝");
  });

  it("이스케이프한 별표와 짝 없는 별표는 글자로 남긴다", () => {
    expect(captionRuns(String.raw`\*글자\* *강조* 미완성*`)).toEqual([
      { text: "*글자* ", highlight: false }, { text: "강조", highlight: true }, { text: " 미완성*", highlight: false },
    ]);
    expect(plainCaptionText(String.raw`*강조 \* 글자*`)).toBe("강조 * 글자");
    expect(plainCaptionText("짝 없는 *별표")).toBe("짝 없는 *별표");
    expect(captionRuns("**")).toEqual([{ text: "**", highlight: false }]);
    expect(captionRuns("")).toEqual([]);
  });

  it("생성 글의 별표를 이스케이프하고 기존 이스케이프를 유지한다", () => {
    expect(escapeCaptionStars("*강조*와 별표*")).toBe(String.raw`\*강조\*와 별표\*`);
    expect(escapeCaptionStars(String.raw`이미 \*별표\*`)).toBe(String.raw`이미 \*별표\*`);
    expect(plainCaptionText(escapeCaptionStars("*문자*"))).toBe("*문자*");
    expect(ttsText("*반가워* 😊 *정말*")).toBe("반가워 정말");
  });
});

describe("자막 스타일과 장면 번호 스키마", () => {
  const clip = { id: "scene-2-caption", startSec: 0, endSec: 1, text: "자막" };
  it("선택 재정의와 배율 범위를 검증한다", () => {
    const style = { color: "#123456", sizeScale: 2, animation: "pop", highlightColor: "#654321" };
    expect(TextClip.parse({ ...clip, style, sceneIndex: 2 })).toMatchObject({ style, sceneIndex: 2 });
    for (const sizeScale of [0.49, 2.01]) expect(TextClip.safeParse({ ...clip, style: { sizeScale } }).success).toBe(false);
    expect(TextClip.safeParse({ ...clip, sceneIndex: -1 }).success).toBe(false);
    expect(TextClip.parse(clip)).not.toHaveProperty("style");
    expect(CAPTION_HIGHLIGHT_DEFAULT).toBe("#FFB020");
  });

  it("저장된 id에서만 장면 번호를 채우고 명시한 번호를 유지한다", () => {
    const parsed = Timeline.parse({ video: [], overlays: [[
      { id: "scene-3-meme-after", memeId: "m", startSec: 0, durationSec: 1, x: 0.5, y: 0.5, width: 0.6 },
      { id: "scene-4-meme-before-extra", inputId: "v", kind: "photo", startSec: 0, durationSec: 1, x: 0.5, y: 0.5, width: 0.6 },
    ]], captionLayers: [{ id: "l", name: "자막", x: 0.5, y: 0.8, style: { font: "pretendard" }, main: [{ ...clip, sceneIndex: 7 }], sub: [{ ...clip, id: "scene-2-sub-caption" }] }],
    voice: [], sfx: [{ id: "scene-3-sfx", file: "s.wav", startSec: 0, inStartSec: 0, inEndSec: 1, gain: 1 }],
    audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
    expect(parsed.captions[0]?.sceneIndex).toBe(7);
    expect(parsed.captionLayers[0]?.sub[0]?.sceneIndex).toBe(2);
    expect(parsed.overlays[0]?.[0]?.sceneIndex).toBe(3);
    expect(parsed.overlays[0]?.[1]).not.toHaveProperty("sceneIndex");
    expect(parsed.sfx[0]?.sceneIndex).toBe(3);
    const legacy = Timeline.parse({ ...parsed, captionLayers: undefined, captions: [clip] });
    expect(legacy.captions[0]?.sceneIndex).toBe(2);
    expect(JSON.parse(JSON.stringify(legacy))).not.toHaveProperty("captions");
  });
});
