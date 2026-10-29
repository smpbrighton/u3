import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BUNDLED_PROMPT_DEFAULTS, PROMPT_REVISION, PROMPT_SCHEMA, PROMPT_TEXT_HASH, PromptDefaultsFile } from "../../src/core/default-prompts";
import { DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA } from "../../src/core/script-prompt";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";

describe("기본 프롬프트 파일", () => {
  it("본문 hash와 bundled revision을 코드의 정본에 맞춘다", () => {
    expect(PROMPT_SCHEMA).toBe(1);
    expect(PROMPT_REVISION).toBe(2);
    const texts = [DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA, DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT];
    expect(PROMPT_TEXT_HASH, "기본 프롬프트를 바꿨으면 PROMPT_REVISION 을 올리고 PROMPT_TEXT_HASH 를 갱신").toBe(createHash("sha256").update(JSON.stringify(texts)).digest("hex"));
    expect(BUNDLED_PROMPT_DEFAULTS).toEqual({ schema: PROMPT_SCHEMA, revision: PROMPT_REVISION, script: texts[0], tone: texts[1], persona: texts[2], carouselTopic: texts[3], carouselVideo: texts[4] });
    expect(PromptDefaultsFile.parse(BUNDLED_PROMPT_DEFAULTS)).toEqual(BUNDLED_PROMPT_DEFAULTS);
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
