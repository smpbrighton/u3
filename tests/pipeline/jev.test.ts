import { describe, expect, it } from "vitest";
import type { JevQuestion, JevRequest } from "../../src/core/jev-api";
import { answerFor, fakeJevClient, JEV_MODEL, JevError, jevClientFromEnv, retryAfterMs, typesafeJevClient } from "../../src/engine/pipeline/jev";

const REQ: JevRequest = {
  state: { text: "차 시트 틈 청소" },
  questions: {
    urgent: { type: "noul", instructions: "Is this urgent?" },
    kind: { type: "choice", instructions: "Which kind?", criteria: { a: null, b: "B option" } },
  },
};
const OK_BODY = {
  model: "jev-1.13.0",
  answers: {
    urgent: { type: "noul", noul: 0.2 },
    kind: { type: "choice", choice: "b", probabilities: { a: 0.1, b: 0.9 }, confidence: 0.8 },
  },
  usage: { input_tokens: 1000, output_tokens: 12 },
};

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function fetchSeq(responses: Response[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift();
    if (!r) throw new Error("응답 없음");
    return r;
  }) as typeof fetch;
  return { calls, impl };
}

describe("TypeSafe 클라이언트", () => {
  it("고정한 모델로 /v1/systemone에 보내고 답·사용량·비용을 돌려준다", async () => {
    const f = fetchSeq([json(200, OK_BODY)]);
    const r = await typesafeJevClient({ apiKey: "k", fetchImpl: f.impl }).ask(REQ);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe("https://api.typesafe.ai/v1/systemone");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer k");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ state: REQ.state, model: JEV_MODEL, questions: REQ.questions });
    expect(r.model).toBe("jev-1.13.0");
    expect(r.answers.urgent).toEqual({ type: "noul", noul: 0.2 });
    expect(r.usage.inputTokens).toBe(1000);
    // 입력 100만 토큰에 $0.042, 출력은 무료
    expect(r.usage.costUsd).toBeCloseTo(0.000042, 9);
    expect(r.retries).toBe(0);
  });

  it("429·529는 retry-after나 지수 백오프만큼 기다렸다 다시 보낸다", async () => {
    const f = fetchSeq([json(429, { detail: "slow down" }, { "retry-after": "2" }), json(529, { detail: "overloaded" }), json(200, OK_BODY)]);
    const waits: number[] = [];
    const r = await typesafeJevClient({ apiKey: "k", fetchImpl: f.impl, sleep: async (ms) => void waits.push(ms) }).ask(REQ);
    expect(waits).toEqual([2000, 2000]);
    expect(r.retries).toBe(2);
    expect(f.calls).toHaveLength(3);
  });

  it("401·422는 바로 실패하고, 재시도가 다 떨어지면 마지막 오류를 던진다", async () => {
    const bad = fetchSeq([json(401, { detail: "bad key" })]);
    await expect(typesafeJevClient({ apiKey: "k", fetchImpl: bad.impl, sleep: async () => {} }).ask(REQ)).rejects.toMatchObject({
      name: "JevError",
      status: 401,
    });
    expect(bad.calls).toHaveLength(1);
    const busy = fetchSeq([json(529, {}), json(529, {}), json(529, {})]);
    await expect(typesafeJevClient({ apiKey: "k", fetchImpl: busy.impl, maxRetries: 2, sleep: async () => {} }).ask(REQ)).rejects.toMatchObject({ status: 529 });
    expect(busy.calls).toHaveLength(3);
  });

  it("답이 빠지거나 종류가 다르거나 형식이 틀리면 에러다", async () => {
    const missing = { ...OK_BODY, answers: { urgent: OK_BODY.answers.urgent } };
    await expect(typesafeJevClient({ apiKey: "k", fetchImpl: fetchSeq([json(200, missing)]).impl }).ask(REQ)).rejects.toThrow("kind");
    const wrong = { ...OK_BODY, answers: { ...OK_BODY.answers, urgent: OK_BODY.answers.kind } };
    await expect(typesafeJevClient({ apiKey: "k", fetchImpl: fetchSeq([json(200, wrong)]).impl }).ask(REQ)).rejects.toThrow("noul → choice");
    await expect(typesafeJevClient({ apiKey: "k", fetchImpl: fetchSeq([json(200, { answers: {} })]).impl }).ask(REQ)).rejects.toBeInstanceOf(JevError);
  });

  it("retry-after는 초나 HTTP 날짜를 읽는다", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("곧")).toBeNull();
  });

  it("키가 없으면 클라이언트를 만들지 않는다", () => {
    expect(jevClientFromEnv({})).toBeNull();
    expect(jevClientFromEnv({ TYPESAFE_API_KEY: "k" })).not.toBeNull();
  });
});

describe("가짜 클라이언트", () => {
  it("질문 종류에 맞는 답을 만든다", async () => {
    const q = REQ.questions.kind as JevQuestion;
    const a = answerFor(q, 0.7, "b");
    expect(a.type === "choice" && a.choice).toBe("b");
    if (a.type !== "choice") return;
    expect(a.probabilities.a).toBeCloseTo(0.3);
    expect(a.confidence).toBeCloseTo(0.4);
    const fake = fakeJevClient((_, q) => answerFor(q, 0.9));
    const r = await fake.ask(REQ);
    expect(r.answers.urgent).toEqual({ type: "noul", noul: 0.9 });
    expect(fake.requests).toEqual([REQ]);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  });
});

