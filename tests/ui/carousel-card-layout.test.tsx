import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Carousel, newSlide } from "../../src/core/carousel";
import { Carousels } from "../../src/ui/screens/Carousels";

const list = vi.hoisted(() => ({ items: [] as unknown[], first: true }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    let value = initial;
    if (list.first && Array.isArray(initial)) { value = list.items; list.first = false; }
    return actual.useState(value === true ? false : value);
  } };
});
vi.mock("../../src/ui/api", () => ({ api: vi.fn(), watchJobs: vi.fn() }));
vi.mock("../../src/ui/screens/carousel/CarouselWorkspace", () => ({ CarouselWorkspace: () => null }));
vi.mock("../../src/ui/screens/carousel/NewCarouselDialog", () => ({ NewCarouselDialog: () => null }));
vi.mock("../../src/ui/screens/carousel/CarouselImage", () => ({ CarouselImage: () => null }));

describe("캐러셀 카드의 긴 제목", () => {
  it.each(["topic", "project"] as const)("%s 카드에서 제목만 줄이고 메뉴 폭과 전체 이름을 유지한다", kind => {
    const name = "올리브영 세일 때 실패 없이 장바구니 채우기 ".repeat(3).trim();
    const source = kind === "topic" ? { kind: "topic" as const } : { kind: "project" as const, projectId: "project", projectName: "원본 영상" };
    list.items = [Carousel.parse({ id: "long-name", name, topic: "주제", source, stage: "images", aspect: "4:5", caption: "", createdAt: "2026-10-28T00:00:00Z", savedAt: "2026-10-28T00:00:00Z", slides: [newSlide(source, "4:5"), newSlide(source, "4:5")] })];
    list.first = true;
    const markup = renderToStaticMarkup(<Carousels onSnackbar={() => undefined} onError={() => undefined} />);
    const title = markup.match(/<strong class="([^"]+)">([^<]+)<\/strong>/)!;
    expect(title[2]).toBe(name);
    const titleClasses = title[1]!.split(" ");
    // 제목의 최소 폭을 0으로 열고 남은 폭만 배분해야 메뉴와 배지가 밀리지 않는다.
    for (const constraint of ["min-w-0", "flex-1", "truncate"]) expect(titleClasses).toContain(constraint);
    const menu = markup.match(/<button[^>]*aria-label="[^"]+ 메뉴"[^>]*>/)![0];
    expect(menu).toContain(`aria-label="${name} 메뉴"`);
    expect(menu).toContain("shrink-0");
    expect(menu).toContain("size-7");
    if (kind === "project") expect(markup).toContain("영상에서");
  });
});
