import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AudioClip, CodexScript, Gain, Input, Project, TextClip, Timeline, VideoClip } from "../../src/core/schema";
import { audioClipLength, cacheKey, clipSpeed, playLength, sourceAt, timelineOffsetOf } from "../../src/core/timeline/speed";

const timeline = {
  video: [], overlays: [], captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};
const input = (id: number) => ({ id: String(id), kind: "video" as const, file: `input/${id}.mp4`, durationSec: 10 });
const project = (inputs: unknown[], name = "테스트 프로젝트") => ({ id: "p", name, inputs, timeline, savedAt: "2026-10-24T00:00:00.000Z" });

describe("047 배속 schema와 원본 좌표", () => {
  const video = { id: "v", kind: "main" as const, inputId: "1", inStartSec: 2, inEndSec: 6 };
  it("선택 배속과 캐시는 저장·재열기 뒤 유지하고 기본 배속은 1이다", () => {
    expect(clipSpeed(VideoClip.parse(video))).toBe(1);
    for (const speed of [0.5, 1, 1.25, 2]) {
      const saved = Project.parse({ ...project([input(1)]), timeline: { ...timeline, video: [{ ...video, speed }] }, audioCache: { [cacheKey("1", speed)]: { file: "cache/audio/a.wav", durationSec: 8, version: "v1" } } });
      const opened = Project.parse(JSON.parse(JSON.stringify(saved)));
      expect(opened.timeline.video[0]?.speed).toBe(speed);
      expect(opened.audioCache).toEqual(saved.audioCache);
      expect(playLength(2, 6, speed)).toBe(4 / speed);
    }
  });
  it("범위 밖·비유한 배속과 사진·짤·효과음 배속을 거절한다", () => {
    for (const speed of [0.49, 2.01, 0, -1, NaN, Infinity]) expect(VideoClip.safeParse({ ...video, speed }).success).toBe(false);
    for (const clip of [{ id: "p", kind: "main", inputId: "1", durationSec: 2 }, { id: "m", kind: "meme", memeId: "m", durationSec: 2 }]) expect(VideoClip.safeParse({ ...clip, speed: 2 }).success).toBe(false);
    expect(Timeline.safeParse({ ...timeline, overlays: [[{ id: "p", kind: "photo", inputId: "1", startSec: 0, durationSec: 2, x: 0.5, y: 0.5, width: 1, speed: 2 }]] }).success).toBe(false);
    expect(Timeline.safeParse({ ...timeline, sfx: [{ id: "s", file: "s.wav", startSec: 0, inStartSec: 0, inEndSec: 2, gain: 1, speed: 2 }] }).success).toBe(false);
    expect(VideoClip.safeParse({ ...video, speed: 2, endTransition: { kind: { kind: "dissolve" }, durationSec: 1.1 } }).success).toBe(false);
  });
  it("원본 좌표 변환과 측정 캐시의 끝을 공유한다", () => {
    const clip = { ...video, speed: 2 };
    expect(sourceAt(clip, 1)).toBe(4);
    expect(timelineOffsetOf(clip, 4)).toBe(1);
    expect(audioClipLength(clip, { file: "a.wav", version: "v", durationSec: 2.98 })).toBeCloseTo(1.98);
  });
});

describe("U3 schema 범위", () => {
  it("입력 1~20개 프로젝트를 허용한다", () => {
    expect(Project.safeParse(project([input(1)])).success).toBe(true);
    expect(Project.safeParse(project(Array.from({ length: 20 }, (_, index) => input(index + 1)))).success).toBe(true);
  });
  it("입력 0개 또는 21개 프로젝트를 거부한다", () => {
    expect(Project.safeParse(project([])).success).toBe(false);
    expect(Project.safeParse(project(Array.from({ length: 21 }, (_, index) => input(index + 1)))).success).toBe(false);
  });
  it("프로젝트 이름을 필수로 받고 한 글자 이상 허용한다", () => {
    expect(Project.safeParse(project([input(1)], "A")).success).toBe(true);
    expect(Project.safeParse(project([input(1)], "")).success).toBe(false);
    const { name: _name, ...missingName } = project([input(1)]);
    expect(Project.safeParse(missingName).success).toBe(false);
  });
  it("Gain은 0~1.5만 허용한다", () => {
    for (const gain of [0, 1.5]) expect(Gain.safeParse({ gain, muted: false }).success).toBe(true);
    for (const gain of [-0.1, 1.51]) expect(Gain.safeParse({ gain, muted: false }).success).toBe(false);
  });
  it("Input과 Timeline의 정상 구조를 검증한다", () => {
    expect(Input.safeParse(input(1)).success).toBe(true);
    expect(Timeline.safeParse(timeline).success).toBe(true);
  });
  it("overlay 없는 옛 Timeline을 빈 겹친 영상 배열로 읽는다", () => {
    expect(Timeline.parse(timeline).overlays).toEqual([]);
  });
  it("겹친 영상은 기본 좌표·폭과 양수 길이를 검증한다", () => {
    const base = { id: "o", memeId: "m", startSec: 1, durationSec: 2, x: 0.5, y: 0.5, width: 0.6 };
    expect(Timeline.parse({ ...timeline, overlays: [[base]] }).overlays).toEqual([[base]]);
    expect(Timeline.safeParse({ ...timeline, overlays: [[{ ...base, width: 1.1 }]] }).success).toBe(false);
    expect(Timeline.safeParse({ ...timeline, overlays: [[{ ...base, durationSec: 0 }]] }).success).toBe(false);
  });
  it("영상 클립에서 inEndSec가 inStartSec보다 커야 한다", () => {
    const base = { id: "v", kind: "main" as const, inputId: "1", inStartSec: 1, inEndSec: 2 };
    expect(VideoClip.safeParse(base).success).toBe(true);
    expect(VideoClip.safeParse({ ...base, inEndSec: 1 }).success).toBe(false);
    expect(VideoClip.safeParse({ ...base, inEndSec: 0.5 }).success).toBe(false);
  });
  it("TextClip에서 endSec가 startSec보다 커야 한다", () => {
    const base = { id: "t", startSec: 1, endSec: 2, text: "자막" };
    expect(TextClip.safeParse(base).success).toBe(true);
    expect(TextClip.safeParse({ ...base, endSec: 1 }).success).toBe(false);
    expect(TextClip.safeParse({ ...base, endSec: 0.5 }).success).toBe(false);
  });
  it("AudioClip에서 inEndSec가 inStartSec보다 커야 한다", () => {
    const base = { id: "a", startSec: 0, file: "voice.wav", inStartSec: 1, inEndSec: 2, gain: 1 };
    expect(AudioClip.safeParse(base).success).toBe(true);
    expect(AudioClip.safeParse({ ...base, inEndSec: 1 }).success).toBe(false);
    expect(AudioClip.safeParse({ ...base, inEndSec: 0.5 }).success).toBe(false);
  });
});

describe("Codex 대본 schema", () => {
  const scene = { caption: "여기서 짤막한 장면", inputIndex: 1, startSec: 1, endSec: 2, reaction: "놀람", memeBefore: false, memeAfter: true, sfxCategory: "shock" };
  it("영상 장면은 구간을 숫자로 받고 photo 장면은 구간과 reaction에 null을 받는다", () => {
    expect(CodexScript.safeParse({ scenes: [scene] }).success).toBe(true);
    expect(CodexScript.safeParse({ scenes: [{ ...scene, startSec: null, endSec: null, reaction: null, sfxCategory: null }] }).success).toBe(true);
  });
  it("구간은 숫자 쌍 또는 null 쌍으로 출력하고 strict JSON Schema에서도 null을 표현한다", () => {
    expect(CodexScript.safeParse({ scenes: [{ ...scene, startSec: null, endSec: 2 }] }).success).toBe(false);
    expect(JSON.stringify(z.toJSONSchema(CodexScript))).toContain("null");
  });
});
