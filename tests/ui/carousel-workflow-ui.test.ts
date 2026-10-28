import { describe, expect, it, vi } from "vitest";
import { Carousel, newSlide } from "../../src/core/carousel";

describe("캐러셀 요청과 글 이동", () => {
  it("주제 요청은 생성하지 않고 기획 결과를 반환한다", async () => {
    const { requestCarouselPlan } = await import("../../src/ui/screens/carousel/workflow");
    const review = { id: "test", stage: "review" } as Carousel;
    const request = vi.fn().mockResolvedValue(review);
    expect(await requestCarouselPlan({ kind: "topic", topic: "서점", count: 3, aspect: "1:1", style: "수채화" }, request)).toBe(review);
    expect(request.mock.calls).toEqual([
      ["POST", "/api/carousels", { topic: "서점", slideCount: 3, aspect: "1:1", style: "수채화" }],
      ["POST", "/api/carousels/test/plan", {}],
    ]);
  });

  it("영상 진입점은 선택한 프로젝트로 기획만 요청한다", async () => {
    const { requestCarouselPlan } = await import("../../src/ui/screens/carousel/workflow");
    const review = { id: "video", stage: "review" } as Carousel;
    const request = vi.fn().mockResolvedValue({ carousel: review });
    expect(await requestCarouselPlan({ kind: "project", projectId: "project/a", count: 5, aspect: "4:5" }, request)).toBe(review);
    expect(request).toHaveBeenCalledExactlyOnceWith("POST", "/api/projects/project%2Fa/carousel", { count: 5, aspect: "4:5" });
  });

  it("글 끌기와 폭 조절은 비율 좌표를 바꾸고 다른 속성을 보존한다", async () => {
    const { transformText } = await import("../../src/ui/screens/carousel/text-geometry");
    const text = newSlide({ kind: "topic" }, "4:5").texts[0]!;
    expect(transformText(text, 0.1, 0.2, false)).toEqual({ ...text, x: 0.18, y: 0.29 });
    expect(transformText(text, 0.1, 0.2, true)).toEqual({ ...text, width: 0.94 });
    expect(transformText(text, -5, 5, false)).toMatchObject({ x: 0, y: 1 });
  });
});
