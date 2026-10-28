import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_PROMPT_DEFAULTS as bundled, PROMPT_SCHEMA } from "../../src/core/default-prompts";
import { createPromptDefaults, promptHash } from "../../src/engine/prompt-defaults";
import { createHash } from "node:crypto";

const roots: string[] = [];
const installed = { U3_RESOURCE_DIR: "/fixture/resources", U3_PROMPTS_URL: "https://fixture.invalid/ignored" };
const remote = { ...bundled, revision: bundled.revision + 1, script: "새 대본 기본값" };
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup(env: NodeJS.ProcessEnv = installed, cache?: unknown) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "u3-prompt-defaults-")); roots.push(dataDir);
  const file = path.join(dataDir, "prompt-defaults.json");
  if (cache !== undefined) await writeFile(file, typeof cache === "string" ? cache : JSON.stringify(cache));
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(remote));
  const prompts = createPromptDefaults({ dataDir, env, fetchImpl });
  return { dataDir, file, fetchImpl, prompts };
}

describe("원격 기본 프롬프트", () => {
  it("캐시가 없으면 bundled를 쓰고 받기 뒤 캐시를 원자적으로 저장한다", async () => {
    const { prompts, fetchImpl, file, dataDir } = await setup();
    expect(await prompts.current()).toEqual(bundled);
    await prompts.refresh();
    expect(await prompts.current()).toEqual(remote);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(remote);
    expect(await readdir(dataDir)).toEqual(["prompt-defaults.json"]);
    expect(fetchImpl.mock.calls[0]![0]).toBe(`https://github.com/smpbrighton/u3/releases/download/prompts/prompts-schema-${PROMPT_SCHEMA}.json`);
    expect(fetchImpl.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([0, -1])("캐시보다 크지 않은 revision은 교체하지 않는다: %s", async delta => {
    const { prompts, fetchImpl, file } = await setup(installed, remote);
    fetchImpl.mockResolvedValue(Response.json({ ...remote, revision: remote.revision + delta, script: "교체하지 않을 본문" }));
    await prompts.refresh();
    expect(await prompts.current()).toEqual(remote);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(remote);
  });

  it.each(["broken", { ...remote, schema: 2 }, { ...remote, revision: 0 }, { ...remote, script: " " }])("무효 캐시는 bundled로 복구한다: %j", async cache => {
    const { prompts } = await setup(installed, cache);
    expect(await prompts.current()).toEqual(bundled);
  });

  it("캐시 revision이 bundled보다 작거나 같으면 bundled를 쓴다", async () => {
    const { prompts } = await setup(installed, { ...bundled, script: "같은 revision의 다른 본문" });
    expect(await prompts.current()).toEqual(bundled);
    // 현재 bundled가 revision 1이므로 더 작은 유효 캐시는 없다. 0은 무효 캐시 시험에서 검증한다.
  });

  it("새 앱의 bundled revision이 캐시보다 크면 bundled를 쓴다", async () => {
    const revision = bundled.revision;
    try {
      bundled.revision = remote.revision + 1;
      const { prompts } = await setup(installed, remote);
      expect(await prompts.current()).toEqual(bundled);
    } finally { bundled.revision = revision; }
  });

  it.each(["network", "timeout", "status", "json", "size", "stream-size", "missing", "schema"])("받기 %s 실패는 이전 캐시를 유지하고 로그만 남긴다", async failure => {
    const { prompts, fetchImpl, file } = await setup(installed, remote);
    if (failure === "network") fetchImpl.mockRejectedValue(new Error("offline"));
    if (failure === "timeout") {
      const controller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      fetchImpl.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })));
      const refreshing = prompts.refresh();
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
      expect(timeout).toHaveBeenCalledWith(10_000);
      controller.abort(new DOMException("timeout", "TimeoutError"));
      await refreshing;
    } else {
      if (failure === "status") fetchImpl.mockResolvedValue(new Response("error", { status: 500 }));
      if (failure === "json") fetchImpl.mockResolvedValue(new Response("broken"));
      if (failure === "size") fetchImpl.mockResolvedValue(new Response("{}", { headers: { "content-length": String(512 * 1024 + 1) } }));
      if (failure === "stream-size") fetchImpl.mockResolvedValue(new Response("가".repeat(180_000)));
      if (failure === "missing") fetchImpl.mockResolvedValue(Response.json({ revision: remote.revision + 1 }));
      if (failure === "schema") fetchImpl.mockResolvedValue(Response.json({ ...remote, revision: remote.revision + 1, schema: 2 }));
      await prompts.refresh();
    }
    expect(await prompts.current()).toEqual(remote);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(remote);
    expect(console.error).toHaveBeenCalled();
  });

  it("개발 실행은 캐시를 읽거나 쓰지 않고 네트워크도 쓰지 않는다", async () => {
    const { prompts, fetchImpl, file } = await setup({}, remote);
    await prompts.refresh();
    expect(await prompts.current()).toEqual(bundled);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(remote);
    const clean = await setup({});
    await clean.prompts.refresh();
    expect(await readdir(clean.dataDir)).toEqual([]);
  });

  it("개발 실행의 시험 URL은 메모리에만 반영한다", async () => {
    const { prompts, fetchImpl, dataDir } = await setup({ U3_PROMPTS_URL: "https://fixture.invalid/prompts" });
    await prompts.refresh();
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://fixture.invalid/prompts");
    expect(await prompts.current()).toEqual(remote);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it.each([100, 4000])("첫 받기는 최대 3초 기다리고 시작과 주기 받기는 기다리지 않는다: %s ms", async delay => {
    const { prompts, fetchImpl } = await setup({ U3_PROMPTS_URL: "https://fixture.invalid/prompts" });
    await prompts.current();
    vi.useFakeTimers();
    fetchImpl.mockImplementation(async () => new Promise(resolve => setTimeout(() => resolve(Response.json(remote)), delay)));
    const stop = prompts.start();
    expect(stop).toBeTypeOf("function");
    let value: unknown;
    const reading = prompts.current().then(result => { value = result; });
    await vi.advanceTimersByTimeAsync(Math.min(delay, 3000) - 1);
    expect(value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await reading;
    expect(value).toEqual(delay < 3000 ? remote : bundled);
    await vi.advanceTimersByTimeAsync(Math.max(0, delay - 3000));
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - delay);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // 첫 받기가 끝났으면 주기 받기는 current를 지연하지 않는다.
    expect(await prompts.current()).toEqual(remote);
    stop();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("프롬프트 hash는 SHA-256 hex다", () => {
    expect(promptHash("기준 본문")).toBe(createHash("sha256").update("기준 본문").digest("hex"));
  });
});
