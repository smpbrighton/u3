import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../../src/engine/app";
import { HttpError } from "../../src/engine/http";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

let root: string;
let app: ReturnType<typeof createApp>;
const lines: string[] = [];
const headers = { authorization: "Bearer request-secret", "content-type": "application/json" };

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "u3-request-log-"));
  const store = new Store(root);
  await store.init();
  lines.length = 0;
  app = createApp({ store, jobs: new Jobs(), token: "request-secret", codexPath: async () => null, jevKey: async () => null, log: (line: string) => lines.push(line) });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it.each(["POST", "PUT", "PATCH", "DELETE"])("%s는 처리 전 도착과 처리 후 상태·시간을 기록한다", async method => {
  app.on(method, "/api/log-test", async c => {
    expect(lines).toEqual([`[req] → ${method} /api/log-test`]);
    return c.json({ body: await c.req.json() }, 201);
  });
  const response = await app.request("/api/log-test?token=query-secret&search=query-private", {
    method, headers, body: JSON.stringify({ private: "body-private" }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ body: { private: "body-private" } });
  expect(lines).toEqual([`[req] → ${method} /api/log-test`, expect.stringMatching(new RegExp(`^\\[req\\] ← 201 ${method} /api/log-test \\d+ms$`))]);
  for (const secret of ["request-secret", "query-secret", "query-private", "body-private", "?", "authorization"]) expect(lines.join("\n")).not.toContain(secret);
});

it("GET 200은 기록하지 않는다", async () => {
  expect((await app.request("/api/health", { headers })).status).toBe(200);
  expect(lines).toEqual([]);
});

it("GET 404는 쿼리 없이 끝만 기록한다", async () => {
  expect((await app.request("/api/missing?token=query-secret&file=query-private", { headers })).status).toBe(404);
  expect(lines).toEqual([expect.stringMatching(/^\[req\] ← 404 GET \/api\/missing \d+ms$/)]);
});

it.each([5000, 5001])("GET 200의 %ims 경계를 적용한다", async elapsed => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  app.get("/api/log-test", c => {
    now.mockReturnValue(elapsed);
    return c.json({ ok: true });
  });
  expect((await app.request("/api/log-test", { headers })).status).toBe(200);
  expect(lines).toEqual(elapsed > 5000 ? [`[req] ← 200 GET /api/log-test ${elapsed}ms`] : []);
});

it("OPTIONS는 기록하지 않는다", async () => {
  const response = await app.request("/api/projects", { method: "OPTIONS", headers: { origin: "tauri://localhost", "access-control-request-method": "POST" } });
  expect(response.status).toBe(204);
  expect(lines).toEqual([]);
});

it.each(["GET", "POST"])("%s 토큰 거부 401도 기록한다", async method => {
  const response = await app.request("/api/health?token=query-secret", { method, headers: { authorization: "Bearer wrong-secret" } });
  expect(response.status).toBe(401);
  expect(lines).toEqual([
    ...(method === "GET" ? [] : ["[req] → POST /api/health"]),
    expect.stringMatching(new RegExp(`^\\[req\\] ← 401 ${method} /api/health \\d+ms$`)),
  ]);
});

it.each(["host", "origin"])("%s 거부 403도 기록한다", async boundary => {
  const url = boundary === "host" ? "http://remote.example/api/health" : "/api/health";
  const response = await app.request(url, { method: "POST", headers: { ...headers, ...(boundary === "origin" ? { origin: "https://remote.example" } : {}) } });
  expect(response.status).toBe(403);
  expect(lines).toEqual(["[req] → POST /api/health", expect.stringMatching(/^\[req\] ← 403 POST \/api\/health \d+ms$/)]);
});

it("예외로 반환한 500도 끝을 기록한다", async () => {
  app.post("/api/log-test", () => { throw new HttpError(500, "test", "실패"); });
  expect((await app.request("/api/log-test", { method: "POST", headers })).status).toBe(500);
  expect(lines).toEqual(["[req] → POST /api/log-test", expect.stringMatching(/^\[req\] ← 500 POST \/api\/log-test \d+ms$/)]);
});

it("log가 없는 기존 컨텍스트도 응답한다", async () => {
  const quiet = createApp({ store: new Store(root), jobs: new Jobs(), token: "request-secret", codexPath: async () => null, jevKey: async () => null });
  expect((await quiet.request("/api/health", { headers })).status).toBe(200);
});
