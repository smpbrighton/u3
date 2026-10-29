import { describe, expect, it } from "vitest";
import * as carousel from "../../src/core/carousel";
import * as image from "../../src/engine/pipeline/codex-image";

const source = { kind: "project" as const, projectId: "p", projectName: "영상" };
describe("영상 캐러셀 보이는 배경", () => {
  it("새 장만 AI 모드로 시작하고 모드 없는 저장본은 frame으로 읽는다", () => {
    expect(carousel.newSlide(source, "4:5").background).toMatchObject({ mode: "ai", generatedStatus: "idle" });
    const slide = carousel.CarouselSlide.parse({ ...carousel.newSlide(source, "4:5"), background: { kind: "frame", sec: 1, cropY: 0.5, frame: { file: "frame.png" }, status: "done" } });
    expect(slide.background).toMatchObject({ mode: "frame" });
    expect(carousel.visibleBackground(slide)).toEqual({ file: "frame.png", status: "done", error: undefined });
  });
  it("AI 상태와 생성 파일을 고르고 윤곽은 파일이 있을 때만 덮는다", () => {
    const slide = carousel.CarouselSlide.parse({ ...carousel.newSlide(source, "4:5"), background: {
      kind: "frame", sec: 1, cropY: 0.5, mode: "ai", frame: { file: "frame.png", version: 2 }, status: "done",
      generatedStatus: "failed", generatedError: "생성 실패", highlight: { style: "ai-outline", target: "상품" },
    } });
    expect(carousel.visibleBackground(slide)).toEqual({ file: undefined, status: "failed", error: "생성 실패" });
    if (slide.background.kind !== "frame") throw new Error("frame 필요");
    slide.background.generated = { file: "gen.png", version: 1, frameVersion: 2 };
    slide.background.generatedStatus = "done";
    expect(carousel.visibleBackground(slide).file).toBe("gen.png");
    slide.background.highlight!.image = { file: "outline.png", version: 1 };
    expect(carousel.visibleBackground(slide).file).toBe("outline.png");
  });
  it("참고 이미지 경로와 상품·새 글자·얼굴 규칙을 지시문에 넣는다", () => {
    const prompt = image.referencePrompt({ prompt: "선반의 상품", style: "사진", referenceImage: "/reference.png", model: "flare", quality: "high", aspect: "4:5", output: "/result.png" });
    for (const text of ["/reference.png", "referenced_image_paths", "선반의 상품", "사진", "/result.png", "같은 상품", "종류·색·모양·패키지 형태", "새 글자·숫자·로고·워터마크를 만들지 않는다", "상품에 원래 있는 글자는 그대로 두되 재현은 보장하지 않는다", "사람은 손 정도만 그리고 얼굴은 그리지 않는다"]) expect(prompt).toContain(text);
  });
});
