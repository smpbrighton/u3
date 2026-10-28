import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CAPTION_HIGHLIGHT_DEFAULT, DEFAULT_CAPTION_STYLE, type CaptionClipStyle, type Timeline } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";
import { measureCaption } from "../../src/remotion/caption-measure";

const local = vi.hoisted(() => ({ frame: 0 }));
vi.mock("remotion", async importOriginal => ({ ...await importOriginal<typeof import("remotion")>(), useCurrentFrame: () => local.frame, useVideoConfig: () => ({ fps: 30 }) }));
vi.mock("../../src/remotion/fonts", () => ({ ensureFonts: () => undefined, useFontRevision: () => 1 }));
const { SceneCaption } = await import("../../src/remotion/U3Short");

const canvas = { font: "", measureText(text: string) { return { width: [...text].length * Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 56) }; } };
beforeAll(() => vi.stubGlobal("document", { createElement: () => ({ getContext: () => canvas }) }));
afterAll(() => vi.unstubAllGlobals());

function markup(text: string, style?: CaptionClipStyle) {
  const timeline: Timeline = { video: [], overlays: [], captions: [{ id: "c", text, startSec: 5, endSec: 8, style }], voice: [], sfx: [],
    audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } };
  return renderToStaticMarkup(<SceneCaption caption={timelineToRender(timeline).captions[0]!} />);
}

describe("자막 합성", () => {
  it("강조 구간을 단어 색 span으로 그리고 표기를 남기지 않는다", () => {
    const html = markup("앞 *단어* 뒤");
    expect(html).toContain(`<span style="color:${CAPTION_HIGHLIGHT_DEFAULT}">단어</span>`);
    expect(html).not.toContain("*");
    expect(markup("*색*", { color: "#123456", highlightColor: "#abcdef" })).toContain('<span style="color:#abcdef">색</span>');
    expect(markup(String.raw`\*문자\*`)).toContain("*문자*");
  });

  it("측정에서 별표를 빼고 긴 강조가 두 줄에 걸쳐도 단어 색을 유지한다", () => {
    const long = "가".repeat(40);
    expect(measureCaption(`*${long}*`, DEFAULT_CAPTION_STYLE, "main")).toEqual(measureCaption(long, DEFAULT_CAPTION_STYLE, "main"));
    const html = markup(`*${long}*`);
    expect(html.match(new RegExp(`color:${CAPTION_HIGHLIGHT_DEFAULT}`, "g"))).toHaveLength(2);
    expect(html).not.toContain("*");
    expect(markup("앞  *두\n단어*  뒤")).not.toContain("*");
  });

  it("자동 맞춤 뒤 배율을 한 번 곱하고 최소 20px를 지킨다", () => {
    const long = "가".repeat(40);
    const fit = measureCaption(long, DEFAULT_CAPTION_STYLE, "main");
    expect(measureCaption(long, DEFAULT_CAPTION_STYLE, "main", 2).fontSize).toBe(fit.fontSize * 2);
    expect(markup(long, { sizeScale: 2 })).toContain(`font-size:${fit.fontSize * 2}px`);
    expect(measureCaption(long, { ...DEFAULT_CAPTION_STYLE, mainSize: 20 }, "main", 0.5).fontSize).toBe(20);
    expect(markup("그대로")).toContain("font-size:56px");
  });

  it("등장 효과는 클립 시작 0.3초 안에서 끝나고 장면의 원본 시각과 무관하다", () => {
    local.frame = 0;
    expect(markup("튀기", { animation: "pop" })).toContain("scale(0.8)");
    expect(markup("올리기", { animation: "rise" })).toContain("translateY(24px)");
    local.frame = 1;
    const shaking = markup("흔들기", { animation: "shake" });
    expect(shaking).toMatch(/translateX\((?!0px)[-\d.]+px\)/);
    local.frame = 9;
    expect(markup("튀기", { animation: "pop" })).toContain("scale(1)");
    expect(markup("올리기", { animation: "rise" })).toContain("translateY(0px)");
    expect(markup("흔들기", { animation: "shake" })).toContain("translateX(0px)");
    local.frame = 0;
    expect(markup("없음", { animation: "none" })).toContain('transform:translateX(-50%)');
  });
});
