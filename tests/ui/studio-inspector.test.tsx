import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers, type Project } from "../../src/core/schema";
import { Inspector } from "../../src/ui/studio/Inspector";

const base = Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", inStartSec: 0, inEndSec: 10 }], captions: [{ id: "a", text: "메인 글", startSec: 1, endSec: 3 }], voice: [{ id: "voice", file: "voice.wav", startSec: 0, inStartSec: 0, inEndSec: 3, gain: 1 }], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const timeline = withCaptionLayers(base, [{ ...captionLayersOf(base)[0]!, sub: [{ id: "sub", text: "서브 글", startSec: 1, endSec: 3 }] }]);
const project = { id: "p", name: "영상", inputs: [], timeline, savedAt: "2026-10-28T00:00:00.000Z" } as Project;
function draw(id: string | null, track: string | null, ids = id ? [id] : []) {
  return renderToStaticMarkup(<Inspector project={project} timeline={timeline} selectedId={id} selectedIds={ids} selectedTrack={track} onChange={vi.fn()} onProject={vi.fn()} onSnackbar={vi.fn()} onUngroup={vi.fn()} onDelete={vi.fn()} />);
}
describe("스튜디오 선택 대상의 속성", () => {
  it("자막 클립은 메인·서브 글이 맨 위이며 스타일은 접혀 있다", () => {
    const html = draw("sub", `${captionLayersOf(timeline)[0]!.id}-sub`);
    expect(html).toContain("이 자막"); expect(html).toContain("메인 글"); expect(html).toContain("서브 글");
    expect(html.indexOf("메인 글")).toBeLessThan(html.indexOf("이 자막 스타일"));
    expect(html).toContain('aria-expanded="false"'); expect(html).toContain("레이어 스타일");
  });
  it("워터마크 선택은 위치·폭·투명도 전부를 표시한다", () => {
    const html = draw("watermark", "brand");
    for (const name of ["가로 위치", "세로 위치", "폭", "투명도"]) expect(html).toContain(name);
    expect(html).not.toContain("타이틀 바");
  });
  it("영상 클립은 원본 구간과 3열 전환 카드를 표시한다", () => {
    const html = draw("v", "video");
    for (const name of ["원본 시작", "원본 끝", "Start Transition", "End Transition", "grid-cols-3", "와이프"]) expect(html).toContain(name);
    expect(html).not.toContain("메인 글");
  });
  it("다른 종류를 함께 고르면 공통 속성과 삭제만 표시한다", () => {
    const html = draw("voice", "voice", ["a", "voice"]);
    expect(html).toContain("선택 2개"); expect(html).toContain("투명도"); expect(html).toContain("삭제");
    expect(html).not.toContain("자막 만들기"); expect(html).not.toContain("트랙 볼륨");
  });
  it("아무것도 고르지 않으면 브랜드를 표시한다", () => {
    const html = draw(null, null);
    expect(html).toContain("브랜드"); expect(html).toContain("워터마크"); expect(html).toContain("타이틀 바");
  });
});
