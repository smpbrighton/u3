import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BUNDLED_PROMPT_DEFAULTS, PROMPT_REVISION, PROMPT_SCHEMA, PROMPT_TEXT_HASH, PromptDefaultsFile } from "../../src/core/default-prompts";
import { DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA, DEFAULT_CAPTION_GUIDE } from "../../src/core/script-prompt";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";

describe("기본 프롬프트 파일", () => {
  it("schema 1과 bundled revision 4를 쓴다", () => {
    expect(PROMPT_SCHEMA).toBe(1);
    expect(PROMPT_REVISION).toBe(4);
    expect(BUNDLED_PROMPT_DEFAULTS.revision).toBe(4);
  });

  it("전역 자막 지침을 포함한 본문 hash를 코드의 정본에 맞춘다", () => {
    const texts = [DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA, DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT, DEFAULT_CAPTION_GUIDE];
    expect(PROMPT_TEXT_HASH, "기본 프롬프트를 바꿨으면 PROMPT_REVISION 을 올리고 PROMPT_TEXT_HASH 를 갱신").toBe(createHash("sha256").update(JSON.stringify(texts)).digest("hex"));
  });

  it("bundled 본문에는 앞뒤 공백을 제거한 전역 자막 지침을 넣는다", () => {
    expect(BUNDLED_PROMPT_DEFAULTS).toEqual({ schema: PROMPT_SCHEMA, revision: PROMPT_REVISION, script: DEFAULT_SCRIPT_PROMPT, tone: DEFAULT_SCRIPT_TONE, persona: DEFAULT_SCRIPT_PERSONA, carouselTopic: DEFAULT_CAROUSEL_TOPIC_PROMPT, carouselVideo: DEFAULT_CAROUSEL_VIDEO_PROMPT, captionGuide: DEFAULT_CAPTION_GUIDE.trim() });
    expect(PromptDefaultsFile.parse(BUNDLED_PROMPT_DEFAULTS)).toEqual(BUNDLED_PROMPT_DEFAULTS);
  });

  it("전역 자막 지침이 없는 revision 3 파일을 빈 지침으로 읽는다", () => {
    const { captionGuide: _captionGuide, ...previous } = { ...BUNDLED_PROMPT_DEFAULTS, revision: 3, captionGuide: "이전 파일에는 없는 지침" };
    expect(PromptDefaultsFile.parse(previous)).toEqual({ ...previous, captionGuide: "" });
  });

  it("전역 자막 지침은 trim 뒤 0~20000자를 허용한다", () => {
    for (const [value, expected] of [["", ""], [" \n ", ""], [`  ${"가".repeat(20_000)}  `, "가".repeat(20_000)]]) {
      expect(PromptDefaultsFile.parse({ ...BUNDLED_PROMPT_DEFAULTS, captionGuide: value })).toMatchObject({ captionGuide: expected });
    }
    expect(PromptDefaultsFile.parse({ ...BUNDLED_PROMPT_DEFAULTS, captionGuide: undefined })).toMatchObject({ captionGuide: "" });
  });

  it.each(["가".repeat(20_001), 42, null])("전역 자막 지침의 한도 초과와 문자열이 아닌 값을 거부한다: %#", value => {
    expect(PromptDefaultsFile.safeParse({ ...BUNDLED_PROMPT_DEFAULTS, captionGuide: value }).success).toBe(false);
  });

  it.each(["script", "carouselTopic", "carouselVideo"] as const)("%s는 trim 뒤 1~20000자를 허용한다", field => {
    expect(PromptDefaultsFile.parse({ ...BUNDLED_PROMPT_DEFAULTS, [field]: `  ${"가".repeat(20_000)}  ` })[field]).toBe("가".repeat(20_000));
    for (const value of [" \n ", "가".repeat(20_001), undefined, 42]) {
      expect(PromptDefaultsFile.safeParse({ ...BUNDLED_PROMPT_DEFAULTS, [field]: value }).success).toBe(false);
    }
  });

  it.each(["tone", "persona"] as const)("%s는 trim 뒤 1~4000자를 허용한다", field => {
    expect(PromptDefaultsFile.parse({ ...BUNDLED_PROMPT_DEFAULTS, [field]: `  ${"가".repeat(4000)}  ` })[field]).toBe("가".repeat(4000));
    for (const value of [" \n ", "가".repeat(4001), undefined, 42]) {
      expect(PromptDefaultsFile.safeParse({ ...BUNDLED_PROMPT_DEFAULTS, [field]: value }).success).toBe(false);
    }
  });

  it.each([{ revision: 0 }, { revision: 1.5 }, { schema: 2 }])("지원하지 않는 번호를 거부한다: %j", patch => {
    expect(PromptDefaultsFile.safeParse({ ...BUNDLED_PROMPT_DEFAULTS, ...patch }).success).toBe(false);
  });
});
