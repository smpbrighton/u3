import { describe, expect, it } from "vitest";
import { BUNDLED_PROMPT_DEFAULTS as local } from "../../src/core/default-prompts";
import { decidePublish, isMissingRemote, parseRemote } from "../../scripts/publish-prompts";

describe("기본 프롬프트 공개 판단", () => {
  it("같은 revision과 본문이면 unchanged다", () => {
    expect(decidePublish({ ...local }, local)).toBe("unchanged");
  });
  it.each([0, 1])("원격 revision이 같거나 크고 본문이 다르면 실패한다: %s", delta => {
    expect(() => decidePublish({ ...local, revision: local.revision + delta, carouselVideo: "다른 본문" }, local)).toThrow(/PROMPT_REVISION/);
  });
  it.each(["tone", "persona"] as const)("%s만 다르고 revision이 같으면 실패한다", field => {
    expect(() => decidePublish({ ...local, [field]: "다른 본문" }, local)).toThrow(/PROMPT_REVISION/);
  });
  it.each([0, 1])("전역 자막 지침만 다르고 원격 revision이 같거나 크면 실패한다: %s", delta => {
    const current = { ...local, captionGuide: "현재 전역 지침" };
    const remote = { ...current, revision: current.revision + delta, captionGuide: "다른 전역 지침" };
    expect(() => decidePublish(remote, current)).toThrow(/PROMPT_REVISION/);
  });
  it("전역 자막 지침만 바꾸고 revision을 올리면 publish다", () => {
    const previous = { ...local, captionGuide: "이전 전역 지침" };
    const current = { ...previous, revision: previous.revision + 1, captionGuide: "새 전역 지침" };
    expect(decidePublish(previous, current)).toBe("publish");
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

describe("원격 파일 읽기", () => {
  it("말투·성격이 없는 이전 revision 파일을 읽고 publish 로 판단한다", () => {
    const { tone: _tone, persona: _persona, captionGuide: _captionGuide, ...previous } = { ...local, revision: 1, captionGuide: "이전 파일에는 없는 지침" };
    const remote = parseRemote(previous);
    expect(remote).toEqual({ ...previous, captionGuide: "" });
    expect(decidePublish(remote, local)).toBe("publish");
  });
  it("전역 자막 지침이 없는 revision 3 파일을 빈 지침으로 읽는다", () => {
    const { captionGuide: _captionGuide, ...previous } = { ...local, revision: 3, captionGuide: "이전 파일에는 없는 지침" };
    expect(parseRemote(previous)).toEqual({ ...previous, captionGuide: "" });
    expect(decidePublish(parseRemote(previous), { ...local, revision: 4 })).toBe("publish");
  });
  it("필수 본문이 빠진 파일은 거부한다", () => {
    const { script: _script, ...broken } = local;
    expect(() => parseRemote(broken)).toThrow();
  });
});

describe("원격 파일 없음 판정", () => {
  it.each([22, 56])("curl 종료 코드와 관계없이 HTTP 404 면 없음이다: %s", status => {
    expect(isMissingRemote({ status, stdout: "\n404" })).toBe(true);
  });
  it("404 가 아닌 실패는 없음이 아니다", () => {
    expect(isMissingRemote({ status: 56, stdout: "\n500" })).toBe(false);
    expect(isMissingRemote({ status: 6, stdout: "" })).toBe(false);
  });
});
