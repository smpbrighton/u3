import { describe, expect, it } from "vitest";
import type { JevAnswer } from "../../src/core/jev-api";
import { matchMemes } from "../../src/core/meme-match";
import { memeFitRequest, memeSceneState, memeSearchText, memeSituationState, orderMemes, readMemeFits, topBySimilarity } from "../../src/core/meme-rank";
import type { MemeMeta } from "../../src/core/schema";
const scene = { caption: "치워도 또 나와서 짜증이 났어요", query: "치워도 또 나와서 짜증", reaction: "분노" };
const lib = (id: string, over: Partial<MemeMeta> = {}): MemeMeta => ({ id, emotion: "분노", situations: [], importedAt: "2026-09-01T00:00:00.000Z", tagsConfirmed: false, ...over });
const answer = (score: number): JevAnswer => ({ type: "score", score, legend: {}, probabilities: {}, confidence: 0.5 });
describe("짤 점수 대체", () => {
  it("Jev 순위가 없으면 규칙 점수로 정렬한다", () => { const memes = [lib("neutral", { emotion: "기쁨" }), lib("angry", { situations: ["짜증"] })]; expect(orderMemes(scene, memes).by).toBe("rule"); expect(orderMemes(scene, memes).list.map((item) => item.meme.id)).toEqual(matchMemes(scene, memes).map((item) => item.meme.id)); });
  it("exclude와 최근 사용 감점을 적용한다", () => { const memes = [lib("a"), lib("b", { importedAt: "2026-09-02T00:00:00.000Z" })]; expect(orderMemes(scene, memes, { exclude: ["a"], recent: ["b"] }, 4).list.map((item) => item.meme.id)).toEqual(["b"]); });
});
describe("Jev 요청 데이터", () => {
  it("장면 상태, 상황 상태와 검색 문장을 만든다", () => { expect(memeSceneState(scene)).toEqual({ 장면: { 자막: scene.caption, 원하는_반응: "분노", 짤_지시: scene.query } }); expect(memeSituationState("짜증남")).toEqual({ 장면: { 상황: "짜증남" } }); expect(memeSearchText(scene)).toBe("분노: 치워도 또 나와서 짜증"); });
  it("설명이 있는 후보만 Jev 질문에 넣는다", () => { const result = memeFitRequest(memeSituationState("짜증"), [{ id: "a", description: "고양이가 노려봄" }, { id: "b" }]); expect(result.asked).toEqual(["a"]); expect(result.unasked).toEqual(["b"]); expect(Object.keys(result.request.questions)).toEqual(["f0"]); });
  it("Jev 답을 적합도 순으로 읽고, 누락은 오류로 알린다", () => { expect(readMemeFits(["a", "b"], ["c"], { f0: answer(1), f1: answer(2) }).map((item) => item.id)).toEqual(["b", "a", "c"]); expect(() => readMemeFits(["a"], [], {})).toThrow(/f0/); });
  it("임베딩 내적의 상위 항목을 선택한다", () => { const result = topBySimilarity([0.6, 0.8], new Float32Array([1, 0, 0, 1, 0.6, 0.8]), 2, 2); expect(result.map((item) => item.index)).toEqual([2, 1]); });
});
