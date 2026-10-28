import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Home, HomeProjectMenuItems } from "../../src/ui/screens/Home";
import type { Project } from "../../src/ui/types";

vi.mock("../../src/ui/screens/carousel/DerivedCarouselDialog", () => ({ DerivedCarouselDialog: () => null }));
// 메뉴의 Portal만 제외하고 실제 항목 조건과 선택 콜백을 검사한다.
vi.mock("../../src/ui/components/ui/dropdown-menu", async importOriginal => ({
  ...await importOriginal<object>(),
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));

const project: Project = {
  id: "p1", name: "새 영상", savedAt: "2026-10-28T00:00:00Z",
  inputs: [{ id: "v1", kind: "video", file: "input/영상.mov", durationSec: 9.7 }],
  timeline: { video: [], captions: [], overlays: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } },
};

describe("영상 목록 화면", () => {
  it("불러오는 중에는 카드 skeleton을 표시하고 빈 상태 문구를 표시하지 않는다", () => {
    const markup = renderToStaticMarkup(<Home status={null} onNew={vi.fn()} onOpen={vi.fn()} onSettings={vi.fn()} onCarouselCreated={vi.fn()} />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="영상 불러오는 중"');
    expect(markup).toContain("animate-pulse");
    expect(markup).not.toContain("아직 영상이 없어요");
  });

  it.each([
    ["미디어만 있음", project, false],
    ["타임라인과 영상 입력 있음", { ...project, timeline: { ...project.timeline, video: [{ id: "clip", kind: "main" as const, inputId: "v1", inStartSec: 0, inEndSec: 9.7 }] } }, true],
    ["타임라인과 사진 입력만 있음", { ...project, inputs: [{ id: "p1", kind: "photo" as const, file: "input/사진.jpg" }], timeline: { ...project.timeline, video: [{ id: "clip", kind: "main" as const, inputId: "p1", inStartSec: 0, inEndSec: 3 }] } }, false],
  ])("카드 메뉴 조건: %s", (_label, value, carousel) => {
    const markup = renderToStaticMarkup(<HomeProjectMenuItems project={value} onRename={vi.fn()} onCarousel={vi.fn()} onDelete={vi.fn()} />);
    expect(markup).toContain("이름 바꾸기");
    expect(markup).toContain("삭제");
    expect(markup.includes("캐러셀 만들기")).toBe(carousel);
  });
});
