import { describe, expect, it } from "vitest";
import { Gain, Input, Project, Timeline } from "../../src/core/schema";
const timeline = { video: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } };
const input = (id: number) => ({ id: String(id), kind: "video" as const, file: `input/${id}.mp4`, durationSec: 10 });
describe("U3 schema 범위", () => {
  it("입력 1~20개를 허용한다", () => { expect(Project.safeParse({ id: "p", inputs: [input(1)], timeline, savedAt: "2026-10-24T00:00:00.000Z" }).success).toBe(true); expect(Project.safeParse({ id: "p", inputs: Array.from({ length: 20 }, (_, i) => input(i + 1)), timeline, savedAt: "2026-10-24T00:00:00.000Z" }).success).toBe(true); });
  it("입력 0개 또는 21개를 거부한다", () => { for (const inputs of [[], Array.from({ length: 21 }, (_, i) => input(i + 1))]) expect(Project.safeParse({ id: "p", inputs, timeline, savedAt: "2026-10-24T00:00:00.000Z" }).success).toBe(false); });
  it("Gain은 0~1.5만 허용한다", () => { for (const gain of [0, 1.5]) expect(Gain.safeParse({ gain, muted: false }).success).toBe(true); for (const gain of [-0.1, 1.51]) expect(Gain.safeParse({ gain, muted: false }).success).toBe(false); });
  it("Input과 Timeline의 시간·클립 형식을 검증한다", () => { expect(Input.safeParse(input(1)).success).toBe(true); expect(Timeline.safeParse(timeline).success).toBe(true); expect(Timeline.safeParse({ ...timeline, video: [{ id: "x", kind: "main", inputId: "1", inStartSec: -1, inEndSec: 2 }] }).success).toBe(false); });
});
