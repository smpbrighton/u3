import { describe, expect, it } from "vitest";
import { BUNDLED_PROMPT_DEFAULTS as local } from "../../src/core/default-prompts";
import { decidePublish } from "../../scripts/publish-prompts";

describe("기본 프롬프트 공개 판단", () => {
  it("같은 revision과 본문이면 unchanged다", () => {
    expect(decidePublish({ ...local }, local)).toBe("unchanged");
  });
  it.each([0, 1])("원격 revision이 같거나 크고 본문이 다르면 실패한다: %s", delta => {
    expect(() => decidePublish({ ...local, revision: local.revision + delta, carouselVideo: "다른 본문" }, local)).toThrow(/PROMPT_REVISION/);
  });
  it("원격이 없거나 revision이 작으면 publish다", () => {
    expect(decidePublish(null, local)).toBe("publish");
    expect(decidePublish(local, { ...local, revision: local.revision + 1, script: "갱신한 본문" })).toBe("publish");
    expect(decidePublish(local, { ...local, revision: local.revision + 1 })).toBe("publish");
  });
  it("원격 revision만 크고 본문이 같으면 publish다", () => {
    expect(decidePublish({ ...local, revision: local.revision + 1 }, local)).toBe("publish");
  });
});
