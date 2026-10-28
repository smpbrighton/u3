import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline, captionLayersOf } from "../../src/core/schema";
import { CaptionEditor } from "../../src/ui/studio/CaptionEditor";
import * as ops from "../../src/core/timeline/ops";

const controls = vi.hoisted(() => new Map<string, Record<string, any>>());
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (p: any) => { controls.set(p["aria-label"] ?? String(p.children), p); return <button disabled={p.disabled}>{p.children}</button>; } }));
vi.mock("../../src/ui/components/ui/slider", () => ({ Slider: (p: any) => { controls.set(p["aria-label"], p); return <div role="slider" />; } }));
vi.mock("../../src/ui/components/ui/switch", () => ({ Switch: (p: any) => { controls.set(p["aria-label"], p); return <button role="switch" aria-checked={p.checked} />; } }));

function fixture() {
  return Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", durationSec: 10 }], captions: [
    { id: "a", startSec: 1, endSec: 3, text: "첫 *자막*", style: { sizeScale: 1.2 } },
    { id: "b", startSec: 5, endSec: 7, text: "둘째 자막" },
  ] });
}
describe("자막 편집기", () => {
  beforeEach(() => { controls.clear(); vi.restoreAllMocks(); });
  it("목록·이전·다음은 같은 선택과 재생 헤드를 바꾼다", () => {
    const timeline = fixture(); const onSelect = vi.fn(); const onSeek = vi.fn();
    const draw = (id: string) => renderToStaticMarkup(<CaptionEditor timeline={timeline} selectedId={id} playhead={2} onSelect={onSelect} onSeek={onSeek} onChange={vi.fn()} loop={false} onLoopChange={vi.fn()} />);
    const html = draw("a");
    expect(html).toContain("첫 자막"); expect(html).toContain("둘째 자막");
    controls.get("다음")!.onClick();
    expect(onSelect).toHaveBeenLastCalledWith("b", `${captionLayersOf(timeline)[0]!.id}-main`);
    expect(onSeek).toHaveBeenLastCalledWith(5);
    draw("b"); controls.get("이전")!.onClick();
    expect(onSelect).toHaveBeenLastCalledWith("a", `${captionLayersOf(timeline)[0]!.id}-main`);
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });
  it("두 손잡이 구간 슬라이더는 setCaptionRange를 거쳐 한 번 반영한다", () => {
    const timeline = fixture(); const onChange = vi.fn(); const range = vi.spyOn(ops, "setCaptionRange");
    renderToStaticMarkup(<CaptionEditor timeline={timeline} selectedId="a" playhead={2} onSelect={vi.fn()} onSeek={vi.fn()} onChange={onChange} loop={false} onLoopChange={vi.fn()} />);
    const slider = controls.get("자막 구간")!;
    expect(slider.value).toEqual([1, 3]); expect(slider.max).toBe(5);
    slider.onValueCommit([0.5, 4]);
    expect(range).toHaveBeenCalledWith(timeline, "a", 0.5, 4);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].captions[0]).toMatchObject({ startSec: 0.5, endSec: 4 });
  });
  it("구간 반복은 선택한 자막을 재생 시작점으로 삼는다", () => {
    const onLoopChange = vi.fn(); const onSeek = vi.fn();
    renderToStaticMarkup(<CaptionEditor timeline={fixture()} selectedId="b" playhead={2} onSelect={vi.fn()} onSeek={onSeek} onChange={vi.fn()} loop={false} onLoopChange={onLoopChange} />);
    controls.get("구간 반복")!.onCheckedChange(true);
    expect(onLoopChange).toHaveBeenCalledWith(true); expect(onSeek).toHaveBeenCalledWith(5);
  });
});
