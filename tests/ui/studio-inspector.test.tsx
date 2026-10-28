import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers, type Project } from "../../src/core/schema";
import { Inspector, parseSpeedInput } from "../../src/ui/studio/Inspector";

const base = Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", inStartSec: 0, inEndSec: 10 }], captions: [{ id: "a", text: "메인 글", startSec: 1, endSec: 3 }], voice: [{ id: "voice", file: "voice.wav", startSec: 0, inStartSec: 0, inEndSec: 3, gain: 1 }], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const timeline = withCaptionLayers(base, [{ ...captionLayersOf(base)[0]!, sub: [{ id: "sub", text: "서브 글", startSec: 1, endSec: 3 }] }]);
const project = { id: "p", name: "영상", inputs: [], timeline, savedAt: "2026-10-28T00:00:00.000Z" } as Project;
function draw(id: string | null, track: string | null, ids = id ? [id] : []) {
  return renderToStaticMarkup(<Inspector project={project} timeline={timeline} selectedId={id} selectedIds={ids} selectedTrack={track} onChange={vi.fn()} onProject={vi.fn()} onSnackbar={vi.fn()} onUngroup={vi.fn()} onDelete={vi.fn()} />);
}
describe("스튜디오 선택 대상의 속성", () => {
  it("047 배속은 영상·음성 하나에만 보이고 원본 소리는 읽기 전용이다", () => {
    expect(draw("v", "video")).toContain('aria-label="배속"');
    expect(draw("v", "video")).toContain('value="1.00"');
    expect(draw("voice", "voice")).toContain('aria-label="배속"');
    expect(draw("a", "captions")).not.toContain('aria-label="배속"');
    expect(draw("v", "video", ["v", "voice"])).not.toContain('aria-label="배속"');
    const t = { ...timeline, video: [{ id: "p", kind: "main" as const, inputId: "p", durationSec: 2 }, { id: "m", kind: "meme" as const, memeId: "m", durationSec: 2 }], sfx: [{ id: "s", startSec: 0, file: "s.wav", inStartSec: 0, inEndSec: 1, gain: 1 }] };
    for (const id of ["p", "m", "s"]) expect(renderToStaticMarkup(<Inspector project={project} timeline={t} selectedId={id} selectedIds={[id]} selectedTrack="video" onChange={vi.fn()} onProject={vi.fn()} onSnackbar={vi.fn()} onUngroup={vi.fn()} onDelete={vi.fn()} />)).not.toContain('aria-label="배속"');
    const sourceProject = { ...project, inputs: [{ id: "v", kind: "video" as const, file: "input/v.mp4" }] };
    const source = renderToStaticMarkup(<Inspector project={sourceProject} timeline={timeline} selectedId="source:v" selectedIds={["source:v"]} selectedTrack="source" onChange={vi.fn()} onProject={vi.fn()} onSnackbar={vi.fn()} onUngroup={vi.fn()} onDelete={vi.fn()} />);
    expect(source).toContain("1.00×"); expect(source).not.toContain('aria-label="배속"');
  });
  it("047 범위와 0.05 간격을 검증하고 처리 중 입력 잠금·취소를 표시한다", () => {
    for (const raw of ["", "abc", "0.49", "2.01", "1.23", "Infinity"]) expect(() => parseSpeedInput(raw)).toThrow();
    for (const raw of ["0.50", "1.25", "2.00"]) expect(parseSpeedInput(raw)).toBe(Number(raw));
    const html = renderToStaticMarkup(<Inspector project={project} timeline={timeline} selectedId="voice" selectedIds={["voice"]} selectedTrack="voice" onChange={vi.fn()} onProject={vi.fn()} onSnackbar={vi.fn()} onUngroup={vi.fn()} onDelete={vi.fn()} speedJob={{ clipId: "voice", job: null, cancel: vi.fn() }} />);
    expect(html).toContain("배속 준비 중"); expect(html).toContain("취소"); expect(html).toContain("disabled");
  });
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
