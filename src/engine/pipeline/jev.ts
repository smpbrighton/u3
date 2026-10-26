// TypeSafe Jev(System One) 호출. 대본 판단 체크포인트(core/script-judge)가 쓴다.
//   POST https://api.typesafe.ai/v1/systemone  (헤더 Authorization: Bearer <TYPESAFE_API_KEY>)
// 한 요청에 질문 여러 개를 넣으면 state를 한 번 읽고 질문을 나란히 푼다(질문끼리는 서로의 답을 보지 못한다).
// 응답은 zod로 검증하고, 질문마다 같은 종류의 답이 왔는지 확인한다.
// 429·529·5xx·연결 실패는 지수 백오프로 다시 시도한다(retry-after가 있으면 따른다). 401·422는 바로 실패다.
import { JevResponse, type JevAnswer, type JevQuestion, type JevRequest } from "../../core/jev-api";

/**
 * 버전을 고정한다. jev-latest는 새 버전이 나오면 가리키는 모델이 바뀌어 같은 대본에도 확률이 달라진다.
 * 판정 임계값(core/script-judge)은 이 버전의 답을 보고 정했으므로 올릴 때 다시 확인한다(docs.typesafe.ai/models).
 */
export const JEV_MODEL = "jev-1.13.0";
export const TYPESAFE_BASE_URL = "https://api.typesafe.ai";
/** 입력 토큰당 USD. jev-1.13.0은 입력 100만 토큰에 $0.042이고 출력 토큰은 받지 않는다(docs.typesafe.ai/models) */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1e6;

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface JevResult {
  /** 실제로 답한 버전 id */
  model: string;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  /** 재시도 대기를 포함한 전체 시간 */
  latencyMs: number;
  retries: number;
}

export interface JevClient {
  ask(req: JevRequest): Promise<JevResult>;
}

export class JevError extends Error {
  constructor(
    message: string,
    /** HTTP 상태. 연결 실패·시간 초과는 null */
    readonly status: number | null,
  ) {
    super(message);
    this.name = "JevError";
  }

  /** 429·5xx(529 포함)·연결 실패만 다시 시도한다 */
  get retryable(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

type FetchLike = typeof fetch;

export const jevCost = (inputTokens: number, outputTokens: number): JevUsage => ({
  inputTokens,
  outputTokens,
  costUsd: inputTokens * JEV_USD_PER_INPUT_TOKEN,
});

/** 질문마다 같은 종류의 답이 있는지 본다. 빠지거나 종류가 다르면 에러 */
export function checkAnswers(questions: Record<string, JevQuestion>, answers: Record<string, JevAnswer>): void {
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    if (!a) throw new JevError(`Jev 응답에 질문 ${id}의 답이 없습니다`, null);
    if (a.type !== q.type) throw new JevError(`Jev 응답의 ${id} 답 종류가 다릅니다(${q.type} → ${a.type})`, null);
  }
}

async function errorOf(res: Response): Promise<JevError> {
  let detail = res.statusText;
  try {
    const text = await res.text();
    if (text) detail = text;
  } catch {
    // 본문 없음
  }
  const hint: Record<number, string> = { 401: "API 키가 틀렸습니다", 422: "요청 형식 오류", 429: "요청이 너무 많습니다", 529: "서버 과부하" };
  return new JevError(`TypeSafe ${res.status}${hint[res.status] ? ` ${hint[res.status]}` : ""}: ${detail.slice(0, 300)}`, res.status);
}

/** retry-after(초 또는 HTTP 날짜) → 밀리초. 없거나 못 읽으면 null */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export interface TypesafeJevOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
  baseUrl?: string;
  /** 시도 한 번의 제한 시간 */
  timeoutMs?: number;
  /** 첫 시도 뒤 최대 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 대기(테스트에서 바꾼다) */
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;

export function typesafeJevClient(opts: TypesafeJevOptions): JevClient {
  const f = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? TYPESAFE_BASE_URL}/v1/systemone`;
  const model = opts.model ?? JEV_MODEL;
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const once = async (body: string): Promise<{ ok: true; json: unknown } | { ok: false; error: JevError; waitMs: number | null }> => {
    let res: Response;
    try {
      res = await f(url, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
    } catch (e) {
      return { ok: false, error: new JevError(`TypeSafe 연결 실패: ${(e as Error).message}`, null), waitMs: null };
    }
    if (!res.ok) return { ok: false, error: await errorOf(res), waitMs: retryAfterMs(res.headers.get("retry-after")) };
    try {
      return { ok: true, json: await res.json() };
    } catch {
      return { ok: false, error: new JevError("TypeSafe 응답이 JSON이 아닙니다", res.status), waitMs: null };
    }
  };

  return {
    async ask(req) {
      const body = JSON.stringify({ state: req.state, model, questions: req.questions });
      const t0 = Date.now();
      for (let attempt = 0; ; attempt++) {
        const r = await once(body);
        if (r.ok) {
          const parsed = JevResponse.safeParse(r.json);
          if (!parsed.success) throw new JevError(`TypeSafe 응답 형식이 다릅니다: ${parsed.error.message.slice(0, 300)}`, 200);
          checkAnswers(req.questions, parsed.data.answers);
          const u = parsed.data.usage;
          return {
            model: parsed.data.model,
            answers: parsed.data.answers,
            usage: jevCost(u.input_tokens, u.output_tokens),
            latencyMs: Date.now() - t0,
            retries: attempt,
          };
        }
        if (!r.error.retryable || attempt >= maxRetries) throw r.error;
        await sleep(r.waitMs ?? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt));
      }
    },
  };
}

/** TYPESAFE_API_KEY가 있으면 클라이언트, 없으면 null(판단을 건너뛴다) */
export function jevClientFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: FetchLike): JevClient | null {
  return env.TYPESAFE_API_KEY ? typesafeJevClient({ apiKey: env.TYPESAFE_API_KEY, fetchImpl }) : null;
}

/** 질문 종류에 맞는 답 하나. noul은 p, choice·score는 고른 것에 p를 주고 나머지에 고르게 나눈다 */
export function answerFor(q: JevQuestion, p: number, pick?: string): JevAnswer {
  if (q.type === "noul") return { type: "noul", noul: p };
  if (q.type === "box") return { type: "box", box: { top: 0.1, bottom: 0.9, left: 0.1, right: 0.9 }, confidence: p };
  const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
  const chosen = pick ?? keys[0]!;
  const rest = keys.length > 1 ? (1 - p) / (keys.length - 1) : 0;
  const probabilities = Object.fromEntries(keys.map((k) => [k, k === chosen ? p : rest]));
  const confidence = keys.length > 1 ? Math.max(0, (keys.length * p - 1) / (keys.length - 1)) : 1;
  if (q.type === "choice") return { type: "choice", choice: chosen, probabilities, confidence };
  const legend = Object.fromEntries(keys.map((k, i) => [k, typeof q.criteria[i] === "string" ? (q.criteria[i] as string) : k]));
  return { type: "score", score: Number(chosen), legend, probabilities, confidence };
}

/**
 * 테스트용 가짜 클라이언트. 질문마다 answer(id, 질문, 요청)로 답을 만든다(answerFor를 쓰면 편하다).
 * 사용량은 state·질문 JSON 글자 수를 4로 나눈 값을 입력 토큰으로 친다.
 */
export function fakeJevClient(
  answer: (id: string, q: JevQuestion, req: JevRequest) => JevAnswer,
  opts: { model?: string; latencyMs?: number } = {},
): JevClient & { requests: JevRequest[] } {
  const requests: JevRequest[] = [];
  return {
    requests,
    async ask(req) {
      requests.push(req);
      const answers = Object.fromEntries(Object.entries(req.questions).map(([id, q]) => [id, answer(id, q, req)]));
      checkAnswers(req.questions, answers);
      const inputTokens = Math.ceil(JSON.stringify({ state: req.state, questions: req.questions }).length / 4);
      return { model: opts.model ?? JEV_MODEL, answers, usage: jevCost(inputTokens, 0), latencyMs: opts.latencyMs ?? 0, retries: 0 };
    },
  };
}
