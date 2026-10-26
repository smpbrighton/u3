import { describe, expect, it } from "vitest";
import { Carousel, carouselFolderName, nextCarouselFolderName, receivedSlideFileName } from "../../src/core/carousel";

const example = {
  id: "carousel-1",
  name: "주제",
  topic: "처음 주제",
  refinedTopic: "고친 주제",
  aspect: "4:5",
  style: "따뜻한 사진",
  slides: [{
    id: "slide-1", title: "제목", body: "본문", textPlacement: "center", imagePrompt: "글자 없는 배경",
    image: { file: "images/slide-1-1.png", version: 1 }, status: "done",
  }],
  createdAt: "2026-10-26T00:00:00.000Z",
  savedAt: "2026-10-26T00:00:00.000Z",
};

describe("Carousel schema", () => {
  it("round trips carousel and slide data through zod", () => {
    const parsed = Carousel.parse(example);
    expect(Carousel.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

describe("carousel receive names", () => {
  it("cleans forbidden path characters, control characters, whitespace, and empty names", () => {
    expect(carouselFolderName("  a/b\\c:d\n  ")).toBe("a-b-c-d-");
    expect(carouselFolderName(" \t\n ")).toBe("캐러셀");
  });

  it("adds a collision number after the folder name", () => {
    expect(nextCarouselFolderName("봄", ["봄", "봄 2", "다른 폴더"])).toBe("봄 3");
    expect(nextCarouselFolderName("새 캐러셀", [])).toBe("새 캐러셀");
  });

  it("numbers only received slides from 01", () => {
    expect([receivedSlideFileName(0), receivedSlideFileName(1)]).toEqual(["01.png", "02.png"]);
  });
});
