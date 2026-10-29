import { describe, expect, it } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers, type AudioClip, type OverlayClip } from "../../src/core/schema";
import { clampAudioTrim, deleteCaptionClip, deleteOverlayClip, deleteVideoClip, moveAudioClip, moveCaptionClip, moveOverlayClip, moveVideoClip, resizeCaptionClip, splitOverlayClip, splitVideoClip, trimAudioClip, trimCaptionClip, trimOverlayClip, trimVideoClip, videoStartTimes } from "../../src/core/timeline/ops";

const empty = (): Timeline => ({ video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const base = (): Timeline => ({ ...empty(), video: [
  { id: "v1", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 4 },
  { id: "photo", kind: "main", inputId: "p", durationSec: 3 },
  { id: "meme", kind: "meme", memeId: "m", durationSec: 2 },
] });

describe("timeline ops", () => {
  it.each<OverlayClip>([
    { id: "scene-2-meme-after", memeId: "m", startSec: 1, durationSec: 4, x: 0.5, y: 0.5, width: 0.6, sceneIndex: 2 },
    { id: "video-overlay", kind: "video", inputId: "in", startSec: 1, inStartSec: 2, inEndSec: 6, x: 0.5, y: 0.5, width: 0.6, sceneIndex: 2 },
    { id: "photo-overlay", kind: "photo", inputId: "p", startSec: 1, durationSec: 4, x: 0.5, y: 0.5, width: 0.6, sceneIndex: 2 },
  ])("오버레이를 나누면 뒤 조각의 장면 번호를 지우고 저장 뒤에도 복원하지 않는다", clip => {
    const timeline: Timeline = { ...base(), overlays: [[clip]] };
    const changed = splitOverlayClip(timeline, clip.id, 2);
    expect(changed.overlays[0]?.[0]?.sceneIndex).toBe(2);
    expect(changed.overlays[0]?.[1]).not.toHaveProperty("sceneIndex");
    expect(Timeline.parse(JSON.parse(JSON.stringify(changed))).overlays[0]?.[1]).not.toHaveProperty("sceneIndex");
    expect(timeline.overlays[0]?.[0]?.sceneIndex).toBe(2);
  });
  it("영상 자르기는 원본 구간을 나누고 입력을 바꾸지 않는다", () => {
    const timeline = base();
    const result = splitVideoClip(timeline, "v1", 1.5);
    expect(result.video.slice(0, 2)).toEqual([
      { id: "v1-a", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 1.5 },
      { id: "v1-b", kind: "main", inputId: "in", inStartSec: 1.5, inEndSec: 4 },
    ]);
    expect(timeline.video[0]).toMatchObject({ inStartSec: 0, inEndSec: 4 });
  });
  it("묶인 영상을 자른 조각은 묶음을 유지하고 바깥 전환만 보존한다", () => {
    const grouped: Timeline = { ...base(), video: [{ id: "g", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 4, groupId: "group-a", startTransition: { kind: { kind: "dissolve" }, durationSec: 0.5 }, endTransition: { kind: { kind: "zoom" }, durationSec: 0.5 } }] };
    const split = splitVideoClip(grouped, "g", 2);
    expect(split.video).toEqual([
      { id: "g-a", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 2, groupId: "group-a", startTransition: { kind: { kind: "dissolve" }, durationSec: 0.5 }, endTransition: { kind: { kind: "none" }, durationSec: 0.5 } },
      { id: "g-b", kind: "main", inputId: "in", inStartSec: 2, inEndSec: 4, groupId: "group-a", startTransition: { kind: { kind: "none" }, durationSec: 0.5 }, endTransition: { kind: { kind: "zoom" }, durationSec: 0.5 } },
    ]);
  });
  it("사진과 짤은 길이를 나누고 트림·이동 뒤 시작 시각을 다시 계산한다", () => {
    let timeline = splitVideoClip(base(), "photo", 5.5);
    expect(timeline.video.slice(1, 3).map((clip) => "durationSec" in clip ? clip.durationSec : 0)).toEqual([1.5, 1.5]);
    timeline = trimVideoClip(timeline, "photo-a", "end", 4.5);
    timeline = moveVideoClip(timeline, "meme", 0);
    expect(videoStartTimes(timeline).meme).toBe(0);
    expect(timeline.video.find((clip) => clip.id === "photo-a")).toMatchObject({ durationSec: 0.5 });
  });
  it("트림은 영상 원본 길이를 넘지 않고 지우면 뒤쪽 클립을 당긴다", () => {
    expect(() => trimVideoClip(base(), "v1", "end", 3.5, 3)).toThrow(/원본 길이/u);
    const after = deleteVideoClip(base(), "photo");
    expect(videoStartTimes(after)).toEqual({ v1: 0, meme: 4 });
  });
  it("영상·사진·짤은 원본 한계와 길이 범위 안에서 다시 늘릴 수 있다", () => {
    const timeline: Timeline = { ...empty(), video: [
      { id: "v", kind: "main", inputId: "in", inStartSec: 1, inEndSec: 4 },
      { id: "photo", kind: "main", inputId: "p", durationSec: 2 },
      { id: "meme", kind: "meme", memeId: "m", durationSec: 2 },
    ] };
    const videoExtended = trimVideoClip(timeline, "v", "start", -0.5, 5);
    expect(videoExtended.video[0]).toMatchObject({ inStartSec: 0.5, inEndSec: 4 });
    const photoExtended = trimVideoClip(timeline, "photo", "end", 6.5);
    expect(photoExtended.video[1]).toMatchObject({ durationSec: 3.5 });
    const memeExtended = trimVideoClip(timeline, "meme", "end", 9, 10);
    expect(memeExtended.video[2]).toMatchObject({ durationSec: 4 });
    expect(() => trimVideoClip(timeline, "meme", "end", 9.1, 10)).toThrow(/0.5~4초/u);
    expect(() => trimVideoClip(timeline, "photo", "end", 2.9)).toThrow(/0보다 커야/u);
    const shortMeme: Timeline = { ...empty(), video: [{ id: "short-meme", kind: "meme", memeId: "m", durationSec: 0.8 }] };
    expect(() => splitVideoClip(shortMeme, "short-meme", 0.4)).toThrow(/0.5~4초/u);
  });
  it("자막·오디오 클립은 독립적으로 이동·트림·삭제한다", () => {
    const timeline: Timeline = { ...empty(), captions: [{ id: "c", startSec: 1, endSec: 3, text: "말" }], voice: [{ id: "a", startSec: 2, file: "v.wav", inStartSec: 0, inEndSec: 4, gain: 1 }] };
    expect(moveCaptionClip(timeline, "c", 4).captions[0]).toMatchObject({ startSec: 4, endSec: 6 });
    expect(trimCaptionClip(timeline, "c", "start", 1.5).captions[0]?.startSec).toBe(1.5);
    expect(moveAudioClip(timeline.voice, "a", 5)[0]?.startSec).toBe(5);
    expect(trimAudioClip(timeline.voice, "a", "start", 3, 5)[0]).toMatchObject({ startSec: 3, inStartSec: 1 });
    expect(trimAudioClip(timeline.voice, "a", "end", 8, 10)[0]).toMatchObject({ inEndSec: 6 });
    expect(() => trimAudioClip(timeline.voice, "a", "end", 13, 10)).toThrow(/파일 길이/u);
    const extendable: Timeline["voice"] = [{ id: "long", startSec: 2, file: "v.wav", inStartSec: 1, inEndSec: 4, gain: 1 }];
    expect(trimAudioClip(extendable, "long", "start", 1, 5)[0]).toMatchObject({ startSec: 1, inStartSec: 0 });
    expect(deleteCaptionClip(timeline.captions, "c")).toEqual([]);
  });
  it("겹친 영상을 옮기고 양쪽을 트림하고 자르며 지운다", () => {
    const timeline: Timeline = { ...empty(), video: [{ id: "main", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 10 }], overlays: [[{ id: "o", kind: "video", inputId: "in", startSec: 1, inStartSec: 2, inEndSec: 6, x: 0.5, y: 0.5, width: 0.6 }]] };
    expect(moveOverlayClip(timeline, "o", 2).overlays[0]?.[0]?.startSec).toBe(2);
    expect(trimOverlayClip(timeline, "o", "start", 2).overlays[0]?.[0]).toMatchObject({ startSec: 2, inStartSec: 3, inEndSec: 6 });
    expect(trimOverlayClip(timeline, "o", "end", 4).overlays[0]?.[0]).toMatchObject({ startSec: 1, inStartSec: 2, inEndSec: 5 });
    expect(splitOverlayClip(timeline, "o", 3).overlays[0]).toMatchObject([{ id: "o-a", inEndSec: 4 }, { id: "o-b", startSec: 3, inStartSec: 4 }]);
    expect(deleteOverlayClip(timeline, "o").overlays).toEqual([]);
    expect(() => moveOverlayClip(timeline, "o", 7)).toThrow();
  });
});

describe("058 타임라인 크기 조절", () => {
  const captions = (): Timeline => ({ ...base(), captions: [
    { id: "prev", startSec: 0, endSec: 2, text: "앞" },
    { id: "c", startSec: 3, endSec: 4, text: "말", style: { color: "#123456" }, sceneIndex: 1 },
    { id: "next", startSec: 6, endSec: 8, text: "뒤" },
  ] });

  it.each([
    ["start", 2.5, 2.5, 4], ["end", 5, 3, 5],
    ["start", -10, 2, 4], ["end", 20, 3, 6],
    ["start", 3.5, 3.5, 4], ["end", 3.5, 3, 3.5],
    ["start", 10, 3.9, 4], ["end", -10, 3, 3.1],
  ] as const)("자막 %s를 %s초로 끌면 잡은 쪽만 %s–%s초로 맞춘다", (edge, toSec, startSec, endSec) => {
    const before = captions();
    const next = resizeCaptionClip(before, "c", edge, toSec);
    expect(next.captions[1]).toEqual({ ...before.captions[1], startSec, endSec });
    expect(next.captions[0]).toEqual(before.captions[0]);
    expect(next.captions[2]).toEqual(before.captions[2]);
    expect(before.captions[1]).toMatchObject({ startSec: 3, endSec: 4 });
  });

  it("다른 자막 줄과 긴 오디오가 있어도 영상 시작과 끝에서 멈춘다", () => {
    const before = captions();
    before.voice = [{ id: "voice", startSec: 0, file: "v.wav", inStartSec: 0, inEndSec: 20, gain: 1 }];
    const layer = captionLayersOf(before)[0]!;
    const layered = withCaptionLayers(before, [{ ...layer, sub: [{ id: "sub", startSec: 3, endSec: 4, text: "서브" }] }]);
    expect(resizeCaptionClip(layered, "sub", "start", -10).captionLayers?.[0]?.sub[0]).toMatchObject({ startSec: 0, endSec: 4 });
    expect(resizeCaptionClip(layered, "sub", "end", 30).captionLayers?.[0]?.sub[0]).toMatchObject({ startSec: 3, endSec: 9 });
    expect(resizeCaptionClip(layered, "sub", "end", 30).captions).toEqual(layered.captions);
  });

  it("범위가 그대로면 같은 timeline을 반환하고 잘못된 자막과 시각은 거절한다", () => {
    const before = captions();
    expect(resizeCaptionClip(before, "c", "end", 4)).toBe(before);
    const bounded = resizeCaptionClip(before, "c", "end", 20);
    expect(resizeCaptionClip(bounded, "c", "end", 20)).toBe(bounded);
    expect(() => resizeCaptionClip(before, "missing", "end", 5)).toThrow(/찾을 수 없습니다/u);
    expect(() => resizeCaptionClip(before, "c", "start", NaN)).toThrow(RangeError);
    expect(() => resizeCaptionClip(before, "c", "end", Infinity)).toThrow(RangeError);
    expect(() => trimCaptionClip(before, "c", "end", 5)).toThrow(/늘리는 트림/u);
  });

  it.each([1, 1.5])("%s배 오디오는 원본 양끝에서 멈추고 반대쪽 경계를 유지한다", speed => {
    const clip: AudioClip = { id: "a", startSec: 2, file: "v.wav", inStartSec: 1.5, inEndSec: 4.5, gain: 1, speed };
    const start = clampAudioTrim(clip, "start", -20, 6);
    expect(start).toBe(2 - 1.5 / speed);
    expect(trimAudioClip([clip], "a", "start", start, 6)[0]).toEqual({ ...clip, startSec: start, inStartSec: 0 });
    const end = clampAudioTrim(clip, "end", 20, 6);
    expect(end).toBe(2 + 4.5 / speed);
    expect(trimAudioClip([clip], "a", "end", end, 6)[0]).toEqual({ ...clip, inEndSec: 6 });
    expect(clampAudioTrim(clip, "start", 2.5, 6)).toBe(2.5);
    expect(clampAudioTrim(clip, "end", 3, 6)).toBe(3);
    expect(clip).toMatchObject({ startSec: 2, inStartSec: 1.5, inEndSec: 4.5 });
    expect(() => trimAudioClip([clip], "a", "end", 20, 6)).toThrow(/파일 길이/u);
  });

  it("오디오 시작은 타임라인 0초보다 앞에 놓지 않는다", () => {
    const clip: AudioClip = { id: "a", startSec: 0.5, file: "v.wav", inStartSec: 2, inEndSec: 5, gain: 1 };
    const toSec = clampAudioTrim(clip, "start", -10, 6);
    expect(toSec).toBe(0);
    expect(trimAudioClip([clip], "a", "start", toSec, 6)[0]).toMatchObject({ startSec: 0, inStartSec: 1.5, inEndSec: 5 });
  });

  it.each([[1, "start"], [1, "end"], [1.5, "start"], [1.5, "end"]] as const)("%s배 오디오의 %s 경계는 소수점 시각에서도 파일 범위를 넘지 않는다", (speed, edge) => {
    const clip: AudioClip = { id: "a", startSec: 1.1, file: "v.wav", inStartSec: 0.3, inEndSec: 4, gain: 1, speed };
    const toSec = clampAudioTrim(clip, edge, edge === "start" ? -10 : 20, 6.1);
    const next = trimAudioClip([clip], "a", edge, toSec, 6.1)[0]!;
    expect(next.inStartSec).toBeGreaterThanOrEqual(0);
    expect(next.inEndSec).toBeLessThanOrEqual(6.1);
    expect(edge === "start" ? next.inStartSec : next.inEndSec).toBeCloseTo(edge === "start" ? 0 : 6.1, 12);
  });

  it("오디오의 0프레임 트림은 기존 규칙으로 거절한다", () => {
    const clip: AudioClip = { id: "a", startSec: 2, file: "v.wav", inStartSec: 0, inEndSec: 3, gain: 1, speed: 1.5 };
    for (const [edge, toSec] of [["start", 3.999], ["end", 2.001]] as const) {
      expect(() => trimAudioClip([clip], "a", edge, clampAudioTrim(clip, edge, toSec, 6), 6)).toThrow(/1프레임/u);
    }
  });
});
