import { describe, expect, it } from "vitest";
import { descriptionScore, matchMemes, scoreMeme, type MemeMatchInput } from "../../src/core/meme-match";
const meme = (over: Partial<MemeMatchInput> & { id: string }): MemeMatchInput => ({ emotion: "기쁨", situations: [], tagsConfirmed: false, importedAt: "2026-09-01T00:00:00.000Z", ...over });
describe("meme-match 규칙 점수", () => {
  it("감정·상황 태그의 정확 일치와 포함 점수를 계산한다", () => {
    const visual = { query: "택배 상자를 열고 깜짝 놀라는 반응", reaction: "당황" };
    expect(scoreMeme(visual, meme({ id: "a", emotion: "당황" }))).toBe(10);
    expect(scoreMeme(visual, meme({ id: "b", emotion: "기쁨", situations: ["당황"] }))).toBe(8);
    expect(scoreMeme({ query: "당황한 표정" }, meme({ id: "c", emotion: "당황" }))).toBe(5);
    expect(scoreMeme(visual, meme({ id: "d", situations: ["깜짝 놀라는"] }))).toBe(4);
    expect(scoreMeme(visual, meme({ id: "e", situations: ["택배 도착"] }))).toBe(2);
    expect(scoreMeme(visual, meme({ id: "f", emotion: "당황", tagsConfirmed: true }))).toBe(10.5);
    expect(scoreMeme(visual, meme({ id: "g", tagsConfirmed: true }))).toBe(0);
  });
  it("점수 순서와 가져온 시각을 적용하고, 요청 수까지 0점을 포함한다", () => {
    const visual = { query: "놀라는 반응", reaction: "당황" };
    const memes = [meme({ id: "old", emotion: "당황", importedAt: "2026-01-01T00:00:00.000Z" }), meme({ id: "zero" }), meme({ id: "new", emotion: "당황", importedAt: "2026-09-01T00:00:00.000Z" }), meme({ id: "tag", situations: ["놀라는 반응"] })];
    expect(matchMemes(visual, memes).map((item) => item.meme.id)).toEqual(["new", "old", "tag"]);
    expect(matchMemes(visual, memes, 10).map((item) => [item.meme.id, item.score])).toEqual([["new", 10], ["old", 10], ["tag", 4], ["zero", 0]]);
    expect(matchMemes(visual, memes, 0)).toEqual([]);
  });
  it("설명 단어가 겹치는 비율을 최대 6점으로 환산한다", () => {
    expect(descriptionScore("고개 끄덕이는 반응", "남자가 고개를 끄덕이며 웃음")).toBe(3.6);
    expect(scoreMeme({ query: "고개 끄덕이는 반응" }, meme({ id: "d", description: "남자가 고개를 끄덕이며 웃음" }))).toBe(3.6);
  });
});
