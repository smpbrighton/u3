import { describe, expect, it } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers } from "../../src/core/schema";
import { applyTtsResults, ttsItemsFromTimeline, ttsOverflow } from "../../src/core/tts-clips";

function timeline() {
  const base = Timeline.parse({ video: [], overlays: [], voice: [], sfx: [], captions: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
  return withCaptionLayers(base, [
    { ...captionLayersOf(base)[0]!, main: [
      { id: "a", startSec: 3, endSec: 4, text: "첫 장면 👨‍👩‍👦! 1️⃣👍🏽\n다음 줄" },
      { id: "b", startSec: 8, endSec: 10, text: "둘째 장면" },
      { id: "c", startSec: 12, endSec: 13, text: "셋째 장면" },
      { id: "empty", startSec: 14, endSec: 15, text: "👨‍👩‍👦 1️⃣" },
    ], sub: [{ id: "sub", startSec: 0, endSec: 1, text: "영어 자막" }] },
    { ...captionLayersOf(base)[0]!, id: "other", main: [{ id: "other", startSec: 0, endSec: 1, text: "다른 레이어" }] },
  ]);
}

describe("TTS 자막 클립", () => {
  it("047 다시 만들기와 전체 생성은 원본 경로와 기존 배속을 보존하고 측정 길이로 경고한다", () => {
    const t = timeline(); t.voice = [{ id: "tts-a", file: "voice/old.wav", startSec: 3, inStartSec: 0, inEndSec: 3, gain: 1, speed: 2 }];
    const next = applyTtsResults(t, [{ captionId: "a", file: "voice/tts-a-generation.wav", durationSec: 2.02 }, { captionId: "b", file: "voice/tts-b-generation.wav", durationSec: 1 }]);
    expect(next.voice.find(c => c.id === "tts-a")).toMatchObject({ speed: 2, file: "voice/tts-a-generation.wav", inEndSec: 2.02 });
    expect(ttsOverflow(next).map(c => c.id)).toContain("tts-a");
    expect(ttsOverflow(next, { "voice/tts-a-generation.wav:2": { file: "cache/audio/a.wav", durationSec: 1, version: "v" } })).toEqual([]);
    expect(next.captionLayers).toEqual(t.captionLayers);
  });
  it("첫 레이어의 메인 자막에서 이모지·키캡·ZWJ·변형 선택자·줄바꿈을 제거하고 빈 글은 제외한다", () => {
    expect(ttsItemsFromTimeline(timeline())).toEqual([
      { captionId: "a", text: "첫 장면 ! 다음 줄" }, { captionId: "b", text: "둘째 장면" }, { captionId: "c", text: "셋째 장면" },
    ]);
  });

  it("지금 자막 시각에 결과 3개를 배치하고 같은 id만 바꾸며 녹음과 다른 편집은 보존한다", () => {
    const original = timeline();
    original.voice = [
      { id: "recording", file: "voice/recording.wav", startSec: 1, inStartSec: 0, inEndSec: 5, gain: 0.7 },
      { id: "tts-a", file: "voice/old.wav", startSec: 0, inStartSec: 0, inEndSec: 1, gain: 1 },
    ];
    const updated = applyTtsResults(original, ["a", "b", "c"].map(captionId => ({ captionId, file: `voice/tts-${captionId}.wav`, durationSec: 2 })));
    expect(updated.voice).toHaveLength(4);
    expect(updated.voice[0]).toEqual(original.voice[0]);
    expect(updated.voice.filter(clip => clip.id.startsWith("tts-")).map(clip => [clip.id, clip.startSec, clip.inEndSec])).toEqual([["tts-a", 3, 2], ["tts-b", 8, 2], ["tts-c", 12, 2]]);
    expect(updated.captionLayers).toEqual(original.captionLayers);
    expect(original.voice[1]?.file).toBe("voice/old.wav");
    expect(ttsOverflow(updated).map(item => item.id)).toEqual(["tts-a", "tts-c"]);
  });

  it("다시 만들기는 한 클립만 바꾸며 생성 중 삭제한 자막의 결과는 넣지 않는다", () => {
    const base = applyTtsResults(timeline(), ["a", "b"].map(captionId => ({ captionId, file: `voice/tts-${captionId}.wav`, durationSec: 1 })));
    const result = applyTtsResults(base, [{ captionId: "a", file: "voice/tts-a.wav", durationSec: 3 }, { captionId: "deleted", file: "voice/tts-deleted.wav", durationSec: 1 }]);
    expect(result.voice.find(clip => clip.id === "tts-a")?.inEndSec).toBe(3);
    expect(result.voice.find(clip => clip.id === "tts-b")).toEqual(base.voice.find(clip => clip.id === "tts-b"));
    expect(result.voice).toHaveLength(2);
  });
});
