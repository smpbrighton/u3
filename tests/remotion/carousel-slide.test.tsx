import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Node 에서는 웹 폰트를 읽지 않는다.
vi.mock("../../src/remotion/fonts", () => ({ ensureFonts: () => undefined, FONT_FAMILY: { body: "sans-serif", title: "sans-serif" } }));

const { CarouselSlide } = await import("../../src/remotion/CarouselSlide");

describe("CarouselSlide", () => {
  // 미리보기는 이미지 URL 을 비동기로 받는다. 빈 src 의 Img 가 오류를 내면 Player 가 그 뒤 URL 을 받아도 비어 있다.
  it("does not render an image element before the image url arrives", () => {
    const markup = renderToStaticMarkup(<CarouselSlide imageUrl="" title="제목" body="본문" textPlacement="bottom" aspect="16:9" highlight={{ style: "dim", box: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 } }} />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("제목");
  });
});
