import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "../../src/engine/app";
import { createEngineLog } from "../../src/engine/engine-log";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

let root: string;
let app: ReturnType<typeof createApp>;
let file: string;
const lines: string[] = [];
const headers = { authorization: "Bearer client-secret", "content-type": "application/json" };
const report = { method: "POST", path: "/api/carousels/carousel/slides/slide/frame", message: "Load failed" };
const uiLines = () => lines.filter(line => line.startsWith("[ui]"));
const send = (body: unknown) => app.request("/api/system/client-log", { method: "POST", headers, body: JSON.stringify(body) });

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "u3-client-log-"));
  const store = new Store(root);
  await store.init();
  lines.length = 0;
  const log = createEngineLog({ dir: path.join(root, "logs"), secrets: () => ["client-secret", "jev-secret"] });
  file = log.file;
  app = createApp({ store, jobs: new Jobs(), token: "client-secret", codexPath: async () => null, jevKey: async () => null, log: (line: string) => { lines.push(line); log.write(line); } });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("연결 실패의 메서드·경로·브라우저 오류를 한 줄로 기록한다", async () => {
  expect((await send(report)).status).toBe(200);
  expect(uiLines()).toEqual([`[ui] 연결 실패 POST ${report.path} : Load failed`]);
});

it("문자열 길이 상한 200·500·500을 허용한다", async () => {
  expect((await send({ method: "M".repeat(200), path: "/".repeat(500), message: "m".repeat(500) })).status).toBe(200);
  expect(uiLines()).toEqual([`[ui] 연결 실패 ${"M".repeat(200)} ${"/".repeat(500)} : ${"m".repeat(500)}`]);
});

it.each([ ["method", 201], ["path", 501], ["message", 501] ] as const)("%s의 %i자는 거부한다", async (field, length) => {
  expect((await send({ ...report, [field]: "x".repeat(length) })).status).toBe(400);
  expect(uiLines()).toEqual([]);
});

it.each([{}, { ...report, message: 1 }, { ...report, path: null }])("필수 문자열이 아니면 거부한다: %j", async body => {
  expect((await send(body)).status).toBe(400);
  expect(uiLines()).toEqual([]);
});

it("로그 파일에 토큰·쿼리·추가 본문을 남기지 않는다", async () => {
  const response = await send({ ...report,
    path: `${report.path}?token=query-secret&search=query-private#fragment-private`,
    message: "Load failed http://127.0.0.1:1234/api/test?token=message-secret&search=message-private client-secret jev-secret",
    body: { private: "body-private" },
  });
  expect(response.status).toBe(200);
  const log = await readFile(file, "utf8");
  expect(log).toContain(`[ui] 연결 실패 POST ${report.path} : Load failed`);
  for (const value of ["client-secret", "jev-secret", "query-secret", "query-private", "fragment-private", "message-secret", "message-private", "body-private", "?token", "&search"]) expect(log).not.toContain(value);
});

it("줄바꿈으로 로그 줄을 추가하지 않는다", async () => {
  expect((await send({ method: "POST\r\n", path: "/api/test\n", message: "Load failed\r\n[ui] injected" })).status).toBe(200);
  expect(uiLines()).toHaveLength(1);
  expect(uiLines()[0]).not.toMatch(/[\r\n]/);
});

it("인증되지 않은 보고는 UI 로그에 남기지 않는다", async () => {
  expect((await app.request("/api/system/client-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) })).status).toBe(401);
  expect(uiLines()).toEqual([]);
});
