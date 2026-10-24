import { describe, expect, it } from "vitest";
import type { Timeline } from "../../src/core/schema";
import { createHistory, pushHistory, redo, undo } from "../../src/core/timeline/history";

const timeline = (gain: number): Timeline => ({ video: [], captions: [], voice: [], sfx: [], audio: { source: { gain, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });

describe("timeline history", () => {
  it("스냅숏을 실행 취소·다시 실행하고 새 편집은 다시 실행 스택을 비운다", () => {
    let state = pushHistory(createHistory(timeline(1)), timeline(0.5));
    state = undo(state);
    expect(state.present.audio.source.gain).toBe(1);
    state = redo(state);
    expect(state.present.audio.source.gain).toBe(0.5);
    state = pushHistory(state, timeline(0.2));
    expect(state.future).toEqual([]);
  });
  it("가장 오래된 항목을 버리고 100개만 보관한다", () => {
    let state = createHistory(timeline(0));
    for (let i = 1; i <= 130; i++) state = pushHistory(state, timeline(i));
    expect(state.past).toHaveLength(100);
    expect(state.past[0]?.audio.source.gain).toBe(30);
  });
  it("호출자와 스택 내부의 스냅숏을 분리한다", () => {
    const original = timeline(1);
    const state = createHistory(original);
    original.audio.source.gain = 0;
    expect(state.present.audio.source.gain).toBe(1);
  });
});
