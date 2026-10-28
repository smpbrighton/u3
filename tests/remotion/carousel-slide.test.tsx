import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultTexts } from "../../src/core/carousel";
import { textObjectStyle, shadeStyle, logoStyle } from "../../src/remotion/carousel-layout";
import { describe, expect, it, vi } from "vitest";

// Node 에서는 웹 폰트를 읽지 않는다.
vi.mock("../../src/remotion/fonts", () => ({ ensureFonts: () => undefined, FONT_FAMILY: { body: "Pretendard" }, CAPTION_FONT_FAMILY: { pretendard: "Pretendard", gmarket: "Gmarket Sans", tmon: "TmonMonsori" } }));

vi.mock("remotion", async importOriginal => ({
  ...await importOriginal<typeof import("remotion")>(),
  Img: ({ src, style }: { src: string; style?: React.CSSProperties }) => <img src={src} style={style} />,
}));

const { CarouselSlide } = await import("../../src/remotion/CarouselSlide");

describe("CarouselSlide", () => {
  // 미리보기는 이미지 URL 을 비동기로 받는다. 빈 src 의 Img 가 오류를 내면 Player 가 그 뒤 URL 을 받아도 비어 있다.
  it("does not render an image element before the image url arrives", () => {
    const markup = renderToStaticMarkup(<CarouselSlide imageUrl="" texts={defaultTexts("16:9").map(t => ({ ...t, text: t.role === "title" ? "제목" : "본문" }))} brightness={1} shade={0.35} aspect="16:9" highlight={{ style: "dim", box: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 } }} />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("제목");
  });
});


describe("carousel object composition", () => {
  it("renders text coordinates, effects, opacity, logo, brightness and shade", () => {
    const texts = defaultTexts("4:5").map((t, i) => ({ ...t, text: i ? "본문\n두 줄" : "제목", x: 0.1, y: i ? 0.7 : 0.1, width: 0.4,
      fontSize: 40, effect: "bar" as const, barColor: i ? "#0000ff" : "#ff0000", opacity: 0.7 }));
    const logo = { enabled: true, x: 0.5, y: 0.2, width: 0.2, opacity: 0.8, file: "logos/logo.png" };
    const markup = renderToStaticMarkup(<CarouselSlide imageUrl="data:image/png;base64,AA==" texts={texts} logo={logo} logoUrl="data:image/png;base64,AQ==" brightness={1.4} shade={0.6} />);
    expect(markup).toContain("left:108px"); expect(markup).toContain("top:135px"); expect(markup).toMatch(/top:94[45](?:\.\d+)?px/);
    expect(markup).toContain("white-space:pre-wrap"); expect(markup).toContain("word-break:keep-all");
    expect(markup).toContain("background:#ff0000"); expect(markup).toContain("background:#0000ff");
    expect(markup).toContain("opacity:0.7"); expect(markup).toContain("brightness(1.4)");
    expect(markup).toContain("rgba(0,0,0,0.6)"); expect(markup).toContain("translate(-50%, -50%)");
    expect(markup).toContain('src="data:image/png;base64,AQ=="');
    const disabled = renderToStaticMarkup(<CarouselSlide imageUrl="" texts={texts} logo={{ ...logo, enabled: false }} logoUrl="logo.png" brightness={1} shade={0} />);
    expect(disabled).not.toContain("<img");
  });
  it("uses the short canvas side for font sizes and applies each text effect", () => {
    const text = { ...defaultTexts("4:5")[0]!, fontSize: 100 };
    expect(textObjectStyle(text, { width: 540, height: 960 })).toMatchObject({ fontSize: 50, textShadow: expect.any(String) });
    expect(textObjectStyle({ ...text, effect: "none", font: "gmarket", weight: 700 }, { width: 1920, height: 1080 })).toMatchObject({ fontSize: 100, fontFamily: "Gmarket Sans" });
    expect(textObjectStyle({ ...text, effect: "outline" }, { width: 1080, height: 1350 })).toMatchObject({ WebkitTextStroke: "0.04em #000", textShadow: expect.any(String) });
    expect(shadeStyle(0.8)).toMatchObject({ background: "linear-gradient(transparent, rgba(0,0,0,0.8))" });
    expect(logoStyle({ enabled: true, file: "logos/logo.png", x: 0.5, y: 0.2, width: 0.1, opacity: 0.6 }, { width: 1080, height: 1350 })).toMatchObject({ left: 540, top: 270, width: 108, opacity: 0.6 });
  });
});
