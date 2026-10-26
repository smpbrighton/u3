import { describe, expect, it } from "vitest";
import { timelineFromScript } from "../../src/core/timeline/from-script";
import type { CodexScript, Input, MemeMeta, SfxMeta } from "../../src/core/schema";

const inputs: Input[] = [
  { id: "photo", kind: "photo", file: "p.jpg" },
  { id: "video", kind: "video", file: "v.mp4", durationSec: 12 },
];
const meme: MemeMeta = { id: "m1", emotion: "laugh", situations: [], importedAt: "now", tagsConfirmed: true, durationSec: 5 };
const sound: SfxMeta = { id: "s1", category: "laugh", file: "s.wav", title: "laugh", source: "local", license: "MIT", durationSec: 0.4 };

describe("timelineFromScript", () => {
  it("짤을 영상 2 오버레이에 두고 본 화면 길이로 자막·효과음 시각을 계산한다", () => {
    const script: CodexScript = { scenes: [
      { caption: "사진 장면", inputIndex: 1, reaction: "웃음", memeBefore: true, memeAfter: true, sfxCategory: "laugh", startSec: null, endSec: null },
      { caption: "영상 장면", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 3, endSec: 6 },
    ] };
    const timeline = timelineFromScript(script, inputs, { memes: { 0: meme }, sfx: { 0: sound } });
    expect(timeline.video.map((clip) => clip.id)).toEqual(["scene-0-main", "scene-1-main"]);
    const photoDuration = Math.max(1.5, [..."사진 장면"].length / 5.7);
    expect(timeline.video[0]).toMatchObject({ durationSec: photoDuration });
    expect(timeline.overlays.flat().map((clip) => clip.id)).toEqual(["scene-0-meme-before", "scene-0-meme-after"]);
    expect(timeline.overlays[0]?.[0]).toMatchObject({ startSec: 0, durationSec: photoDuration, x: 0.5, width: 0.6 });
    expect(timeline.overlays[1]?.[0]).toMatchObject({ startSec: 0, durationSec: photoDuration });
    expect(timeline.captions[0]).toMatchObject({ startSec: 0, endSec: photoDuration });
    expect(timeline.sfx[0]).toMatchObject({ startSec: 0, file: "s.wav" });
    expect(timeline.captions[1]?.startSec).toBe(photoDuration);
    expect(timeline.video.at(-1)).toMatchObject({ inStartSec: 3, inEndSec: 6 });
  });
  it("사진 기본 길이는 최소 1.5초이고 영상 구간은 원본 경계에서 거부한다", () => {
    const short: CodexScript = { scenes: [{ caption: "Hi", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: null, endSec: null }] };
    expect(timelineFromScript(short, inputs).video[0]).toMatchObject({ durationSec: 1.5 });
    const outside: CodexScript = { scenes: [{ caption: "길이 초과", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 9, endSec: 13 }] };
    expect(() => timelineFromScript(outside, inputs)).toThrow(/원본 길이/u);
  });

  it("같은 입력의 맞닿은 장면은 영상 클립 하나로 합치고 장면 시각은 유지한다", () => {
    const script: CodexScript = { scenes: [
      { caption: "첫 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 0.3, endSec: 2.4 },
      { caption: "둘째 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 2.4, endSec: 5.2 },
      { caption: "셋째 장면", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 0.3, endSec: 2.4 },
      { caption: "넷째 장면", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 2.4, endSec: 6.6 },
    ] };
    const timeline = timelineFromScript(script, [
      { id: "video-a", kind: "video", file: "a.mp4", durationSec: 10 },
      { id: "video-b", kind: "video", file: "b.mp4", durationSec: 10 },
    ]);

    expect(timeline.video).toHaveLength(2);
    expect(timeline.video.map(clip => "inputId" in clip && "inStartSec" in clip && "inEndSec" in clip ? [clip.inputId, clip.inStartSec, clip.inEndSec] : null)).toEqual([
      ["video-a", 0.3, 5.2], ["video-b", 0.3, 6.6],
    ]);
    expect(timeline.captions.map(({ startSec, endSec }) => [startSec, endSec])).toEqual([[0, 2.1], [2.1, 4.9], [4.9, 7], [7, 11.2]]);
  });

  it("같은 입력이어도 원본 구간 사이에 빈틈이 있으면 영상 클립을 나눈다", () => {
    const script: CodexScript = { scenes: [
      { caption: "첫 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 0.3, endSec: 2.4 },
      { caption: "둘째 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 3, endSec: 5 },
    ] };
    const timeline = timelineFromScript(script, [{ id: "video-a", kind: "video", file: "a.mp4", durationSec: 10 }]);

    expect(timeline.video).toHaveLength(2);
  });

  it("허용 오차 안의 경계 차이는 장면별 자막 시간과 합친 영상 길이에 반영하지 않는다", () => {
    const script: CodexScript = { scenes: [
      { caption: "첫 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 0.3, endSec: 2.4 },
      { caption: "둘째 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 2.42, endSec: 5.2 },
    ] };
    const timeline = timelineFromScript(script, [{ id: "video-a", kind: "video", file: "a.mp4", durationSec: 10 }]);

    expect(timeline.video).toHaveLength(1);
    expect(timeline.video[0] && "inStartSec" in timeline.video[0] && "inEndSec" in timeline.video[0]
      ? timeline.video[0].inEndSec - timeline.video[0].inStartSec : null).toBeCloseTo(4.88);
    expect(timeline.captions.map(({ startSec, endSec }) => [startSec, endSec])).toEqual([[0, 2.1], [2.1, 4.88]]);
  });

  it("reaction null 장면에 연결한 짤은 overlays에 두고 영상 길이를 늘리지 않는다", () => {
    const script: CodexScript = { scenes: [
      { caption: "첫 장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: true, sfxCategory: null, startSec: 0.3, endSec: 2.4 },
    ] };
    const timeline = timelineFromScript(script, [{ id: "video-a", kind: "video", file: "a.mp4", durationSec: 10 }], { memes: { 0: meme } });

    expect(timeline.video).toHaveLength(1);
    expect(timeline.video[0]).not.toHaveProperty("memeId");
    const overlay = timeline.overlays.flat()[0];
    expect(overlay && "memeId" in overlay ? overlay.memeId : null).toBe("m1");
    expect(overlay?.startSec).toBeCloseTo(0.1);
    expect(overlay && "durationSec" in overlay ? overlay.durationSec : null).toBe(2);
    expect(timeline.captions[0]).toMatchObject({ startSec: 0, endSec: 2.1 });
  });

  it("sfxCategory별 라이브러리 효과음을 자막과 같은 시각에 최대 1.5초 배치한다", () => {
    const script: CodexScript = { scenes: [
      { caption: "놀람", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: "shock", startSec: null, endSec: null },
      { caption: "반전", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: "reveal", startSec: 3, endSec: 6 },
    ] };
    const timeline = timelineFromScript(script, inputs, {
      projectId: "project-a",
      sfxLibrary: {
        shock: [{ ...sound, id: "shock-1", category: "shock", file: "shock.wav", durationSec: 0.4 }],
        reveal: [{ ...sound, id: "reveal-1", category: "reveal", file: "reveal.wav", durationSec: 2.4 }],
      },
    });

    expect(timeline.sfx).toHaveLength(2);
    expect(timeline.sfx[0]).toMatchObject({ startSec: timeline.captions[0]?.startSec, file: "shock.wav", inStartSec: 0, inEndSec: 0.4 });
    expect(timeline.sfx[1]).toMatchObject({ startSec: timeline.captions[1]?.startSec, file: "reveal.wav", inStartSec: 0, inEndSec: 1.5 });
  });

  it("효과음 분류가 없거나 해당 분류 라이브러리가 비면 클립을 만들지 않는다", () => {
    const script: CodexScript = { scenes: [
      { caption: "기본 반응", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: null, endSec: null },
      { caption: "라이브러리 없음", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: "alarm", startSec: 1, endSec: 3 },
    ] };
    const timeline = timelineFromScript(script, inputs, { projectId: "project-a", sfxLibrary: { shock: [sound] } });

    expect(timeline.sfx).toEqual([]);
  });

  it("같은 프로젝트 ID와 장면 번호에서 같은 효과음 파일을 고른다", () => {
    const script: CodexScript = { scenes: [
      { caption: "장면", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: "laugh", startSec: null, endSec: null },
    ] };
    const sfxLibrary = { laugh: [
      { ...sound, id: "laugh-1", file: "laugh-1.wav" },
      { ...sound, id: "laugh-2", file: "laugh-2.wav" },
    ] };
    const first = timelineFromScript(script, inputs, { projectId: "project-a", sfxLibrary });
    const second = timelineFromScript(script, inputs, { projectId: "project-a", sfxLibrary });

    expect(first.sfx[0]?.file).toBe(second.sfx[0]?.file);
  });
});
