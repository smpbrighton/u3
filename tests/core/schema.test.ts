import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AudioClip, CodexScript, Gain, Input, Project, TextClip, Timeline, VideoClip } from "../../src/core/schema";

const timeline = {
  video: [], overlay: [], captions: [], voice: [], sfx: [],
  audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
};
const input = (id: number) => ({ id: String(id), kind: "video" as const, file: `input/${id}.mp4`, durationSec: 10 });
const project = (inputs: unknown[], name = "테스트 프로젝트") => ({ id: "p", name, inputs, timeline, savedAt: "2026-10-24T00:00:00.000Z" });

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
    expect(Timeline.parse(timeline).overlay).toEqual([]);
  });
  it("겹친 영상은 기본 좌표·폭과 양수 길이를 검증한다", () => {
    const base = { id: "o", memeId: "m", startSec: 1, durationSec: 2, x: 0.5, y: 0.5, width: 0.6 };
    expect(Timeline.parse({ ...timeline, overlay: [base] }).overlay).toEqual([base]);
    expect(Timeline.safeParse({ ...timeline, overlay: [{ ...base, width: 1.1 }] }).success).toBe(false);
    expect(Timeline.safeParse({ ...timeline, overlay: [{ ...base, durationSec: 0 }] }).success).toBe(false);
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
