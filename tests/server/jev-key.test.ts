import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { createJevKeyStore } from "../../src/engine/jev-key";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const firstKey = "fixture-jev-first-abcd";
const secondKey = "fixture-jev-second-efgh";
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function setup(env: NodeJS.ProcessEnv = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-jev-key-"));
  roots.push(root);
  const securityPath = path.join(root, "security");
  // stdin 명령 구문은 security의 split_line과 같은 인용·이스케이프 규칙을 쓴다.
  await writeFile(securityPath, `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, "calls.jsonl"), JSON.stringify(args) + "\\n");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  if (fs.existsSync(path.join(root, "fail"))) {
    process.stderr.write("private detail: fixture-jev-first-abcd");
    process.exit(1);
  }
  let command = args;
  if (args[0] === "-i") {
    if (input.split("\\n").filter(Boolean).length !== 1 || Buffer.byteLength(input.trimEnd()) > 4095) process.exit(2);
    command = [];
    let word = "", quoted = false, escaped = false, quote = "";
    for (const ch of input.trimEnd()) {
      if (escaped) { word += ch; escaped = false; }
      else if (ch === "\\\\") escaped = true;
      else if (quoted && ch === quote) quoted = false;
      else if (!quoted && (ch === '"' || ch === "'")) { quoted = true; quote = ch; }
      else if (!quoted && /\\s/.test(ch)) { if (word) command.push(word); word = ""; }
      else word += ch;
    }
    if (word) command.push(word);
  }
  const option = name => command[command.indexOf(name) + 1];
  if (option("-a") !== "u3" || option("-s") !== "u3-jev-api-key") process.exit(2);
  if (!command.includes("login.keychain-db") && !command.includes(path.join(root, "login.keychain-db"))) process.exit(2);
  const file = path.join(root, "fake-key");
  if (command[0] === "add-generic-password") {
    if (args[0] !== "-i" || !command.includes("-U")) process.exit(2);
    const key = command.includes("-X") ? Buffer.from(option("-X"), "hex").toString() : option("-w");
    fs.writeFileSync(file, key);
  } else if (command[0] === "find-generic-password") {
    if (!fs.existsSync(file)) process.exit(44);
    process.stdout.write(fs.readFileSync(file, "utf8") + "\\n");
  } else if (command[0] === "delete-generic-password") {
    if (!fs.existsSync(file)) process.exit(44);
    fs.unlinkSync(file);
  } else process.exit(2);
});
`);
  await chmod(securityPath, 0o755);
  const options = { securityPath, keychainPath: path.join(root, "login.keychain-db"), env };
  const keys = createJevKeyStore(options);
  const store = new Store(path.join(root, "store"));
  await store.init();
  const app = createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: keys.readJevKey, jevKeyStore: keys });
  const request = (route: string, method = "GET", body?: unknown) => app.request(route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ model: "jev-1.13.0", answers: { valid: { type: "noul", noul: 1 } }, usage: { input_tokens: 1, output_tokens: 0 } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return { root, keys, options, store, request, fetchMock };
}

describe("Jev Keychain", () => {
  it("키를 stdin으로 저장하고 캐시·다시 읽기·갱신·삭제를 지원한다", async () => {
    const { keys, root, options } = await setup();
    expect(await keys.readJevKey()).toBeNull();
    await keys.saveJevKey(firstKey);
    expect(await keys.readJevKey()).toBe(firstKey);
    const callsBefore = await readFile(path.join(root, "calls.jsonl"), "utf8");
    expect(await keys.readJevKey()).toBe(firstKey);
    expect(await readFile(path.join(root, "calls.jsonl"), "utf8")).toBe(callsBefore);
    expect(await createJevKeyStore(options).readJevKey()).toBe(firstKey);
    await keys.saveJevKey(secondKey);
    expect(await keys.readJevKey()).toBe(secondKey);
    await keys.deleteJevKey();
    expect(await keys.readJevKey()).toBeNull();
    expect(await createJevKeyStore(options).readJevKey()).toBeNull();
    await keys.deleteJevKey();
    const calls = await readFile(path.join(root, "calls.jsonl"), "utf8");
    expect(calls).not.toContain(firstKey);
    expect(calls).not.toContain(secondKey);
    expect(calls).not.toContain(Buffer.from(firstKey).toString("hex"));
  });

  it("4000자 키와 인용 부호·역슬래시를 손실 없이 저장한다", async () => {
    const { keys, options } = await setup();
    for (const key of ["x".repeat(4000), 'fixture-"quoted"-\\-key-abcd']) {
      await keys.saveJevKey(key);
      expect(await createJevKeyStore(options).readJevKey()).toBe(key);
    }
  });

  it("개발 환경 키를 우선하며 저장·삭제 뒤에도 환경 키를 유지한다", async () => {
    const { keys, options } = await setup({ TYPESAFE_API_KEY: "fixture-development-key" });
    await keys.saveJevKey(firstKey);
    expect(await keys.readJevKey()).toBe("fixture-development-key");
    expect(await createJevKeyStore({ ...options, env: {} }).readJevKey()).toBe(firstKey);
    await keys.deleteJevKey();
    expect(await keys.readJevKey()).toBe("fixture-development-key");
  });

  it("설치본(U3_RESOURCE_DIR 있음)은 환경 키를 무시하고 Keychain 키만 쓴다", async () => {
    // launchctl setenv 등으로 GUI 앱 환경에 TYPESAFE_API_KEY 가 있어도 설정에 입력한 키가 쓰여야 한다.
    const { keys } = await setup({ TYPESAFE_API_KEY: "fixture-development-key", U3_RESOURCE_DIR: "/Applications/U3.app/Contents/Resources/resources" });
    expect(await keys.readJevKey()).toBeNull();
    await keys.saveJevKey(firstKey);
    expect(await keys.readJevKey()).toBe(firstKey);
    await keys.deleteJevKey();
    expect(await keys.readJevKey()).toBeNull();
  });

  it("저장 실패 뒤 기존 캐시를 유지하고 자식 프로세스 오류를 노출하지 않는다", async () => {
    const { keys, root } = await setup();
    await keys.saveJevKey(secondKey);
    await writeFile(path.join(root, "fail"), "");
    await expect(keys.saveJevKey(firstKey)).rejects.toThrow("Keychain");
    await expect(keys.saveJevKey(firstKey)).rejects.not.toThrow(firstKey);
    expect(await keys.readJevKey()).toBe(secondKey);
    await expect(keys.deleteJevKey()).rejects.toThrow("Keychain");
    expect(await keys.readJevKey()).toBe(secondKey);
  });
});

describe("Jev 키 API", () => {
  it("같은 앱에서 저장·교체·삭제 뒤 상태와 끝 4자 힌트를 즉시 바꾼다", async () => {
    const { request, store, fetchMock } = await setup();
    expect(await (await request("/api/system/jev")).json()).toMatchObject({ hasKey: false, keyHint: null, available: false });
    for (const key of [firstKey, secondKey]) {
      const saved = await request("/api/system/jev-key", "PUT", { key: `  ${key}  ` });
      expect(saved.status).toBe(200);
      const body = await saved.text();
      expect(body).not.toContain(key);
      expect(JSON.parse(body)).toMatchObject({ hasKey: true, keyHint: key.slice(-4), available: true });
      expect(await (await request("/api/system/jev")).json()).toMatchObject({ hasKey: true, keyHint: key.slice(-4) });
      const system = await (await request("/api/system")).text();
      expect(system).not.toContain(key);
      expect(JSON.parse(system)).toMatchObject({ jev: { hasKey: true, available: true } });
      expect(JSON.stringify(await store.readSettings())).not.toContain(key);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toMatchObject(["https://api.typesafe.ai/v1/systemone", { headers: { authorization: `Bearer ${firstKey}` } }]);
    const deleted = await request("/api/system/jev-key", "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ hasKey: false, keyHint: null, available: false });
    expect(await (await request("/api/system/jev")).json()).toMatchObject({ hasKey: false, available: false });
  });

  it.each(["", "   ", "x".repeat(4001), "fixture\nkey", "fixture\0key", null, 5])("잘못된 입력 %#을 외부 호출·저장 전에 거절한다", async key => {
    const { request, keys, fetchMock } = await setup();
    const response = await request("/api/system/jev-key", "PUT", { key });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await keys.readJevKey()).toBeNull();
  });

  it.each([401, 403])("인증 실패 %i는 기존 키를 보존하고 키 확인 안내만 응답한다", async status => {
    const { request, keys, fetchMock } = await setup();
    await keys.saveJevKey(secondKey);
    fetchMock.mockImplementation(async () => new Response(`rejected ${firstKey}`, { status }));
    const response = await request("/api/system/jev-key", "PUT", { key: firstKey });
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("키를 확인해 주세요");
    expect(body).not.toContain(firstKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await keys.readJevKey()).toBe(secondKey);
  });

  it.each(["network", "server"])("%s 실패는 키를 저장하고 비밀값 없는 경고를 응답한다", async kind => {
    const { request, keys, fetchMock } = await setup();
    fetchMock.mockImplementation(async () => { if (kind === "network") throw new Error(firstKey); return new Response(firstKey, { status: 503 }); });
    const response = await request("/api/system/jev-key", "PUT", { key: firstKey });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ hasKey: true, warning: expect.any(String) });
    expect(body).not.toContain(firstKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await keys.readJevKey()).toBe(firstKey);
  });

  it("Keychain 저장 실패의 응답과 로그에 키를 남기지 않는다", async () => {
    const { request, root } = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await writeFile(path.join(root, "fail"), "");
    const response = await request("/api/system/jev-key", "PUT", { key: firstKey });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(firstKey);
    expect(JSON.stringify(log.mock.calls)).not.toContain(firstKey);
  });

  it("라이브러리 판정이 요청마다 현재 키를 사용하고 삭제 뒤에는 요청하지 않는다", async () => {
    const { request, keys, fetchMock, root } = await setup();
    vi.stubEnv("U3_LIBRARY_DIR", path.join(root, "library"));
    try {
      for (const key of [firstKey, secondKey]) {
        await keys.saveJevKey(key);
        const response = await request("/api/library/sfx/judge", "POST", { q: "알림", ids: [] });
        expect(response.status).toBe(200);
        const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
        expect(call[1].headers).toMatchObject({ authorization: `Bearer ${key}` });
      }
      await keys.deleteJevKey();
      expect((await request("/api/library/sfx/judge", "POST", { q: "알림", ids: [] })).status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllEnvs(); }
  });
});
