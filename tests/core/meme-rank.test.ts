import { describe, expect, it } from "vitest";
import type { JevAnswer } from "../../src/core/jev-api";
import { matchMemes, type MemeMatchInput } from "../../src/core/meme-match";
import {
  memeDoc,
  memeFitRequest,
  memeRankKey,
  memeSceneState,
  memeSearchText,
  memeSituationState,
  mergeCandidates,
  orderMemes,
  readMemeFits,
  topBySimilarity,
  type MemeRankScene,
} from "../../src/core/meme-rank";
import type { MemeMeta } from "../../src/core/schema";

const scene = (over: Partial<MemeRankScene> = {}, caption = "치워도 또 나와서 짜증이 났어요"): MemeRankScene => ({
  caption,
  query: "치워도 또 나와서 짜증",
  reaction: "분노",
  ...over,
});
const lib = (id: string, over: Partial<MemeMeta> = {}): MemeMatchInput => ({
  id, emotion: "분노", situations: [], tagsConfirmed: false, importedAt: "2026-09-01T00:00:00.000Z", ...over,
});
const score = (n: number): JevAnswer => ({ type: "score", score: n, legend: {}, probabilities: {}, confidence: 0.5 });

describe("memeRankKey", () => {
  it("자막, reaction, query가 바뀌면 key가 바뀐다", () => {
    const base = memeRankKey(scene());
    expect(memeRankKey(scene())).toBe(base);
    expect(memeRankKey(scene({}, "다른 자막"))).not.toBe(base);
    expect(memeRankKey(scene({ query: "다른 지시" }))).not.toBe(base);
    expect(memeRankKey(scene({ reaction: "당황" }))).not.toBe(base);
    expect(memeRankKey(scene({ reaction: undefined }))).not.toBe(base);
  });
  it("대본이 선택한 짤 id는 key에 들어가지 않는다", () => {
    const legacy = { ...scene(), memeId: "m1", altMemeIds: ["m2"] } as MemeRankScene;
    expect(memeRankKey(legacy)).toBe(memeRankKey(scene()));
  });
});

describe("Jev에 줄 글", () => {
  it("장면 상태는 자막·원하는 반응·짤 지시를 담고 reaction이 없으면 생략한다", () => {
    expect(memeSceneState(scene())).toEqual({ 장면: { 자막: "치워도 또 나와서 짜증이 났어요", 원하는_반응: "분노", 짤_지시: "치워도 또 나와서 짜증" } });
    expect(memeSceneState(scene({ reaction: undefined }))).toEqual({ 장면: { 자막: "치워도 또 나와서 짜증이 났어요", 짤_지시: "치워도 또 나와서 짜증" } });
  });
  it("짤 검색용 상황과 검색 문장을 만든다", () => {
    expect(memeSituationState("짜증남")).toEqual({ 장면: { 상황: "짜증남" } });
    expect(memeSearchText({ query: "짜증", reaction: "분노" })).toBe("분노: 짜증");
    expect(memeSearchText({ query: "짜증" })).toBe("짜증");
    expect(memeDoc({ emotion: "분노", situations: ["짜증", "청소"], description: "고양이가 노려봄" })).toBe("분노: 고양이가 노려봄 (짜증, 청소)");
  });
});

describe("memeFitRequest", () => {
  const candidates = [{ id: "a", description: "고양이가 노려봄" }, { id: "b" }, { id: "c", description: "개가 웃음" }];
  it("설명 있는 후보마다 score 질문을 만들고, 설명 없는 후보는 묻지 않는다", () => {
    const result = memeFitRequest(memeSituationState("짜증"), candidates);
    expect(result.asked).toEqual(["a", "c"]);
    expect(result.unasked).toEqual(["b"]);
    expect(Object.keys(result.request.questions)).toEqual(["f0", "f1"]);
    for (const question of Object.values(result.request.questions)) {
      expect(question.type).toBe("score");
      expect(question.type === "score" && question.criteria).toHaveLength(4);
    }
  });
  it("각 질문에는 대상 설명만 넣고 장면 상태를 별도로 보낸다", () => {
    const result = memeFitRequest(memeSceneState(scene()), candidates);
    const question = result.request.questions.f0!;
    expect(Object.keys(question.instructions as object).sort()).toEqual(["질문", "짤"]);
    expect((question.instructions as { 짤: string }).짤).toBe("고양이가 노려봄");
    expect(JSON.stringify(result.request.questions)).not.toContain("원하는_반응");
    expect(Object.keys((result.request.state as { 장면: object }).장면)).toEqual(["자막", "원하는_반응", "짤_지시"]);
    expect(JSON.stringify(question)).not.toContain("개가 웃음");
  });
});

describe("readMemeFits", () => {
  it("적합도 내림차순, 동점은 원래 순서, 미질문 후보는 마지막에 둔다", () => {
    const fits = readMemeFits(["a", "b", "c", "d"], ["z"], { f0: score(1), f1: score(2.5), f2: score(2.5), f3: score(0) });
    expect(fits.map((fit) => fit.id)).toEqual(["b", "c", "a", "d", "z"]);
    expect(fits[0]).toEqual({ id: "b", fit: 2.5, confidence: 0.5 });
    expect(fits.at(-1)).toEqual({ id: "z", fit: 0, confidence: 0 });
  });
  it("필수 Jev 답이 없으면 질문 번호를 포함해 오류를 낸다", () => {
    expect(() => readMemeFits(["a"], [], {})).toThrow(/f0/);
  });
});

describe("topBySimilarity·mergeCandidates", () => {
  it("벡터 내적 상위 k개를 내고 점수가 같으면 원래 순서를 유지한다", () => {
    const matrix = new Float32Array([1, 0, 0, 1, 0.6, 0.8, 0.6, 0.8]);
    const top = topBySimilarity([0.6, 0.8], matrix, 2, 3);
    expect(top.map((item) => item.index)).toEqual([2, 3, 1]);
    expect(top[0]!.sim).toBeCloseTo(1);
    expect(topBySimilarity([1, 0], matrix, 2, 1)).toEqual([{ index: 0, sim: 1 }]);
  });
  it("검색 후보 순서를 유지하며 규칙 후보의 중복을 제거한다", () => {
    expect(mergeCandidates(["a", "b"], ["b", "c", "a"])).toEqual(["a", "b", "c"]);
    expect(mergeCandidates([], ["x"])).toEqual(["x"]);
  });
});

describe("규칙 점수로 짤 순위를 정한다", () => {
  const visual = scene();
  const library = [lib("a", { situations: ["짜증"] }), lib("b", { emotion: "당황" }), lib("c")];
  it("Jev 순위가 없으면 규칙 점수 결과를 그대로 반환한다", () => {
    const result = orderMemes(visual, library, {}, 3);
    expect(result.by).toBe("rule");
    expect(result.list).toEqual(matchMemes(visual, library, 3));
  });
  it("exclude 후보는 제외하고 최근 후보는 6점을 감점한다", () => {
    const result = orderMemes(visual, library, { exclude: ["a"], recent: ["b"] }, 3);
    expect(result.list.map((item) => item.meme.id)).toEqual(["c", "b"]);
    expect(result.list).toEqual(matchMemes(visual, library, 3, { exclude: ["a"], recent: ["b"] }));
    expect(result.list[1]!.score).toBe(matchMemes(visual, library, 3).find((item) => item.meme.id === "b")!.score - 6);
  });
  it("limit 수만큼만 순위를 돌려준다", () => {
    expect(orderMemes(visual, library, {}, 2).list).toHaveLength(2);
    expect(orderMemes(visual, library, {}, 0).list).toEqual([]);
  });
});
