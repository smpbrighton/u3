import { describe, expect, it } from "vitest";
import { descriptionScore, matchMemes, scoreMeme, type MemeMatchInput } from "../../src/core/meme-match";
const meme = (over: Partial<MemeMatchInput> & { id: string }): MemeMatchInput => ({ emotion: "기쁨", situations: [], tagsConfirmed: false, importedAt: "2026-09-01T00:00:00.000Z", ...over });
describe("meme-match", () => {
  it("감정·상황 점수와 사람이 확정한 태그 보너스를 적용한다", () => {
    const visual = { query: "택배 상자를 열고 깜짝 놀라는 반응", reaction: "당황" };
    expect(scoreMeme(visual, meme({ id: "a", emotion: "당황" }))).toBe(10);
    expect(scoreMeme(visual, meme({ id: "b", emotion: "기쁨", situations: ["당황"] }))).toBe(8);
    expect(scoreMeme({ query: "당황한 표정" }, meme({ id: "c", emotion: "당황" }))).toBe(5);
    expect(scoreMeme(visual, meme({ id: "d", situations: ["깜짝 놀라는"] }))).toBe(4);
    expect(scoreMeme(visual, meme({ id: "e", situations: ["택배 도착"] }))).toBe(2);
    expect(scoreMeme(visual, meme({ id: "f", emotion: "당황", tagsConfirmed: true }))).toBe(10.5);
    expect(scoreMeme(visual, meme({ id: "g", tagsConfirmed: true }))).toBe(0);
    expect(scoreMeme({ query: "아 네" }, meme({ id: "h", situations: ["아이고 네네"] }))).toBe(0);
  });
  it("점수 내림차순, 동점은 최근 추가 순서, 부족하면 0점 후보도 반환한다", () => {
    const visual = { query: "놀라는 반응", reaction: "당황" };
    const memes = [meme({ id: "old", emotion: "당황", importedAt: "2026-01-01T00:00:00.000Z" }), meme({ id: "zero" }), meme({ id: "new", emotion: "당황", importedAt: "2026-09-01T00:00:00.000Z" }), meme({ id: "tag", situations: ["놀라는 반응"] })];
    expect(matchMemes(visual, memes).map((item) => item.meme.id)).toEqual(["new", "old", "tag"]);
    expect(matchMemes(visual, memes, 10).map((item) => [item.meme.id, item.score])).toEqual([["new", 10], ["old", 10], ["tag", 4], ["zero", 0]]);
    expect(matchMemes(visual, memes, 0)).toEqual([]);
  });
  it("짤 설명의 bigram 겹침 비율을 점수로 쓴다", () => {
    expect(descriptionScore("고개 끄덕이는 반응", "남자가 고개를 끄덕이며 웃음")).toBe(3.6);
    expect(scoreMeme({ query: "고개 끄덕이는 반응" }, meme({ id: "d", description: "남자가 고개를 끄덕이며 웃음" }))).toBe(3.6);
  });
  it("exclude를 빼고 recent 후보에 감점을 적용한다", () => {
    const memes = [meme({ id: "a", emotion: "당황" }), meme({ id: "b", emotion: "당황" }), meme({ id: "c" })];
    const result = matchMemes({ query: "놀라는 반응", reaction: "당황" }, memes, 3, { exclude: ["a"], recent: ["b"] });
    expect(result.map((item) => [item.meme.id, item.score])).toEqual([["b", 4], ["c", 0]]);
  });
});
