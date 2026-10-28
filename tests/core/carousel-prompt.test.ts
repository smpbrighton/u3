import { describe, expect, it } from "vitest";
import {
  CAROUSEL_PROMPT_MAX_LENGTH, DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT,
  carouselTopicPrompt, carouselVideoPrompt, resolveCarouselPrompt,
} from "../../src/core/carousel-prompt";

describe("캐러셀 기획 프롬프트", () => {
  it.each([
    [DEFAULT_CAROUSEL_TOPIC_PROMPT, "주제를 독자에게 건네는 일관된 편집 글로 구성하여 캐러셀을 기획한다.", "10. 출력 전에 각 카드가 따로 읽혀도 의미가 분명한지"],
    [DEFAULT_CAROUSEL_VIDEO_PROMPT, "제공된 영상 자막과 장면 정보를 독자에게 건네는 일관된 편집 글로 재구성하여 캐러셀을 기획한다.", "11. 출력 전에 각 카드의 독립적인 가독성과 전체 글의 연결·진전을 함께 점검한다."],
  ])("기본 본문과 마지막 점검 규칙을 포함하고 길이 제한 안에 든다", (prompt, firstLine, lastRule) => {
    expect(prompt.split("\n")[0]).toBe(firstLine);
    expect(prompt).toContain(lastRule);
    expect(CAROUSEL_PROMPT_MAX_LENGTH).toBe(20_000);
    expect(prompt.length).toBeLessThanOrEqual(CAROUSEL_PROMPT_MAX_LENGTH);
  });

  it("주제 본문 뒤에 요청 장수와 주제와 화풍을 붙인다", () => {
    expect(carouselTopicPrompt({ basePrompt: "저장한 주제 지침", count: 3, topic: "바다", style: "수채화" }))
      .toBe("저장한 주제 지침\n\n요청 장수: 3\n주제: 바다\n요청 화풍: 수채화");
  });

  it("화풍이 없거나 비어 있으면 요청 화풍 줄을 붙이지 않는다", () => {
    for (const style of [undefined, ""]) {
      expect(carouselTopicPrompt({ basePrompt: "지침", count: 2, topic: "하늘", style }))
        .toBe("지침\n\n요청 장수: 2\n주제: 하늘");
    }
  });

  it("영상 본문 뒤에 요청 장수와 자료 JSON을 붙인다", () => {
    const material = { scenes: [{ sceneNumber: 1, caption: "상품" }], captionLayersMain: ["자막"], title: "제목", videoDurationSec: 5 };
    expect(carouselVideoPrompt({ basePrompt: "저장한 영상 지침", count: 2, material }))
      .toBe(`저장한 영상 지침\n\n요청 장수: 2\n자료: ${JSON.stringify(material)}`);
  });

  it("저장한 비어 있지 않은 문자열은 그대로 쓰고 나머지는 기본값으로 바꾼다", () => {
    expect(resolveCarouselPrompt("  저장 지침  ", "기본 지침")).toBe("  저장 지침  ");
    for (const saved of [undefined, null, "", " \n\t ", 42, false, {}]) {
      expect(resolveCarouselPrompt(saved, "기본 지침")).toBe("기본 지침");
    }
  });
});
