import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Carousel, newSlide } from "../../src/core/carousel";
import { CarouselWorkspace } from "../../src/ui/screens/carousel/CarouselWorkspace";
import { CarouselTextInspector } from "../../src/ui/screens/carousel/CarouselTextInspector";
import { CarouselOverflowNotice, textOverflowsCanvas } from "../../src/ui/screens/carousel/CarouselOverflow";
import { BackgroundSection } from "../../src/ui/screens/carousel/BackgroundSection";
import { canDownloadSlides } from "../../src/ui/screens/carousel/derived-ui-state";
import { slideImage, slideStatus } from "../../src/ui/screens/carousel/workflow";

vi.mock("../../src/ui/api", () => ({ api: vi.fn(), carouselFileUrl: vi.fn(), watchJobs: vi.fn() }));
vi.mock("../../src/remotion/CarouselSlide", () => ({ CarouselSlide: () => null }));
vi.mock("@remotion/player", () => ({ Player: () => <div data-player="true" /> }));
vi.mock("../../src/ui/update-save", () => ({ useBeforeUpdateRestart: () => undefined }));

function carousel(stage: "review" | "images") {
  return Carousel.parse({ id: "test", name: "캐러셀 검증", topic: "주제", source: { kind: "topic" }, stage, aspect: "4:5",
    caption: "게시할 캡션", createdAt: "2026-10-28T00:00:00Z", savedAt: "2026-10-28T00:00:00Z",
    slides: [1, 2, 3].map(n => ({ ...newSlide({ kind: "topic" }, "4:5"), id: `slide-${n}`,
      texts: newSlide({ kind: "topic" }, "4:5").texts.map(t => ({ ...t, text: t.role === "title" ? "제목 글" : "본문 글", ...(t.role === "body" ? { x: 0.22, fontSize: 52 } : {}) })) })),
  });
}

describe("캐러셀 화면", () => {
  it("AI 모드는 다시 만들기와 모드 선택을 보이고 세로 자르기를 숨긴다", () => {
    const slide = newSlide({ kind: "project", projectId: "p", projectName: "영상" }, "4:5");
    if (slide.background.kind !== "frame") throw new Error("frame 필요");
    const props = { frame: slide.background, duration: 10, sourceAvailable: true, busy: false, onChange: vi.fn(), onCommit: vi.fn(), onReextract: vi.fn(), onRegenerate: vi.fn(), onModeChange: vi.fn() };
    const ai = renderToStaticMarkup(<BackgroundSection {...props} />);
    for (const text of ["AI 이미지", "원본 장면", "이 시각으로 다시 만들기", ">다시 만들기<"]) expect(ai).toContain(text);
    expect(ai).not.toContain("세로 자르기");
    const frame = renderToStaticMarkup(<BackgroundSection {...props} frame={{ ...slide.background, mode: "frame" }} />);
    expect(frame).toContain("세로 자르기"); expect(frame).toContain("이 시각으로 다시 뽑기");
    expect(frame).not.toContain(">다시 만들기<");
  });
  it("영상 검토 화면도 장별 지시문을 고칠 수 있다", () => {
    const source = { kind: "project" as const, projectId: "p", projectName: "영상" };
    const value = { ...carousel("review"), source, slides: [newSlide(source, "4:5"), { ...newSlide(source, "4:5"), id: "slide-2" }] };
    const html = renderToStaticMarkup(<CarouselWorkspace carousel={value} jobs={[]} onBack={vi.fn()} onUpdate={vi.fn()} onSnackbar={vi.fn()} onError={vi.fn()} />);
    expect(html).toContain('aria-label="1장 이미지 지시문"'); expect(html).toContain('aria-label="2장 이미지 지시문"');
  });
  it("완료 표시·미리보기·받기는 생성 이미지 상태를 따른다", () => {
    const slide = newSlide({ kind: "project", projectId: "p", projectName: "영상" }, "4:5");
    if (slide.background.kind !== "frame") throw new Error("frame 필요");
    slide.background.frame = { file: "frame.png", version: 1 }; slide.background.status = "done";
    expect(slideStatus(slide)).toBe("idle"); expect(slideImage(slide)).toBeUndefined(); expect(canDownloadSlides([slide])).toBe(false);
    slide.background.generatedStatus = "done"; slide.background.generated = { file: "generated.png", version: 1, frameVersion: 1 };
    expect(slideStatus(slide)).toBe("done"); expect(slideImage(slide)?.file).toBe("generated.png"); expect(canDownloadSlides([slide])).toBe(true);
  });
  it("검토 단계에서만 장 더하기·지우기·순서 바꾸기를 제공한다", async () => {
    const review = renderToStaticMarkup(<CarouselWorkspace carousel={carousel("review")} jobs={[]} onBack={vi.fn()} onUpdate={vi.fn()} onSnackbar={vi.fn()} onError={vi.fn()} />);
    expect(review).toContain("장 더하기");
    expect(review).toContain("장 지우기");
    expect(review).toContain("순서 바꾸기");
    expect(review).toContain("이미지 만들기");
    const images = renderToStaticMarkup(<CarouselWorkspace carousel={carousel("images")} jobs={[]} onBack={vi.fn()} onUpdate={vi.fn()} onSnackbar={vi.fn()} onError={vi.fn()} />);
    for (const label of ["장 더하기", "장 지우기", "순서 바꾸기", "다시 기획"]) expect(images).not.toContain(label);
    expect(images).toContain("글 더하기");
    expect(images).toContain("carousel-player");
  });

  it("고른 글 객체의 글과 속성을 인스펙터 맨 위에 표시한다", async () => {
    const slide = carousel("images").slides[0]!;
    const html = renderToStaticMarkup(<CarouselTextInspector texts={slide.texts} selectedId="body" onSelect={vi.fn()} onChange={vi.fn()} />);
    expect(html.indexOf("본문 글")).toBeLessThan(html.indexOf("제목 글"));
    expect(html).toContain('aria-label="가로 위치"');
    expect(html).toContain("22%");
    expect(html).toContain("52px");
    expect(html).toContain('data-slot="property-row"');
  });

  it("넘친 글 경고를 표시하고 정상인 장에서는 숨긴다", async () => {
    expect(textOverflowsCanvas({ left: 80, top: 900, width: 900, height: 600 }, { width: 1080, height: 1350 })).toBe(true);
    expect(textOverflowsCanvas({ left: 80, top: 90, width: 900, height: 60 }, { width: 1080, height: 1350 })).toBe(false);
    expect(renderToStaticMarkup(<CarouselOverflowNotice count={2} />)).toContain("넘친 글이 있는 장 2개");
    expect(renderToStaticMarkup(<CarouselOverflowNotice count={0} />)).toBe("");
  });
});
