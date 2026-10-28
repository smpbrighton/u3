import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

const model = (slug: string, visibility = "list") => ({ slug, display_name: slug.toUpperCase(), visibility, supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }] });
const LIVE = { models: [model("gpt-6-luna"), model("gpt-6.1-terra"), model("gpt-6-sol", "hide"), model("anthropic/claude-opus-5-5")] };
const BUNDLED = { models: [model("gpt-6-luna"), model("gpt-6-sol")] };

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const catalogSlugs = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-astra"];
async function compatCodex(options: { saved?: string; failed?: string[]; quota?: boolean; version?: string } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-codex-compat-")); roots.push(root);
  const bin = path.join(root, "codex");
  const unavailable = `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`;
  const script = { scenes: [{ caption: "직접 써 봤어. 너는 어때? 😊", inputIndex: 1, startSec: null, endSec: null, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null }] };
  await writeFile(bin, `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2), root = ${JSON.stringify(root)};
if (args[0] === "--version") console.log("codex-cli ${options.version ?? "0.165.0"}");
else if (args[0] === "login") console.log("Logged in using ChatGPT");
else if (args[0] === "debug") {
  fs.appendFileSync(root + "/catalog-calls", "call\\n");
  console.log(${JSON.stringify(JSON.stringify({ models: catalogSlugs.map(slug => model(slug)) }))});
} else if (args.includes("--help")) console.log("--output-schema --output-last-message --json --ephemeral --sandbox --image");
else {
  process.stdin.resume();
  process.stdin.on("end", () => {
    const selected = args[args.indexOf("-m") + 1];
    fs.appendFileSync(root + "/calls.jsonl", JSON.stringify({ model: selected, args }) + "\\n");
    if (${!!options.quota}) { console.error("usage limit reached"); process.exitCode = 1; }
    else if (${JSON.stringify(options.failed ?? ["gpt-6-luna"])}.includes(selected)) { console.error(${JSON.stringify(unavailable)}); process.exitCode = 1; }
    else {
      fs.writeFileSync(args[args.indexOf("--output-last-message") + 1], ${JSON.stringify(JSON.stringify(script))});
      console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 2 } }));
    }
  });
}
`, { mode: 0o755 });
  const store = new Store(root), jobs = new Jobs();
  await store.saveSettings({ codexModel: options.saved ?? "gpt-6-luna", codexEffort: "high", scriptTone: "보존" });
  const project = await store.createProject("모델 재시도");
  await store.saveProject({ ...project, inputs: [{ id: "photo", kind: "photo", file: "input/photo.png" }] });
  const app = createApp({ store, jobs, token: "test-token", codexPath: async () => bin, jevKey: async () => null, resourceDir: path.join(root, "resources") });
  const recommend = () => app.request(`/api/projects/${project.id}/script/recommend`, { method: "POST", headers, body: JSON.stringify({ mode: "direct", prompt: "짧게", images: ["photo.png"] }) });
  const finish = async () => {
    const response = await recommend(); expect(response.status).toBe(202);
    return jobs.wait((await response.json() as { id: string }).id);
  };
  const calls = async () => (await readFile(path.join(root, "calls.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { model: string; args: string[] });
  return { root, store, jobs, app, recommend, finish, calls };
}

// 가짜 codex: `debug models` 는 최신 목록, `debug models --bundled` 는 실행 파일에 든 목록을 낸다. live 가 0 이 아니면 최신 목록 조회가 실패한다.
async function fakeCodex(live: boolean) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-codex-models-"));
  roots.push(root);
  const bin = path.join(root, "codex");
  await writeFile(path.join(root, "live.json"), JSON.stringify(LIVE));
  await writeFile(path.join(root, "bundled.json"), JSON.stringify(BUNDLED));
  await writeFile(bin, `#!/bin/sh\nif [ "$3" = "--bundled" ]; then cat "${root}/bundled.json"; exit 0; fi\n${live ? `cat "${root}/live.json"` : "exit 1"}\n`);
  await chmod(bin, 0o755);
  const store = new Store(root);
  return createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => bin, jevKey: async () => null });
}

const slugs = async (app: Awaited<ReturnType<typeof fakeCodex>>) => {
  const response = await app.request("/api/system/codex-models", { headers: { authorization: "Bearer test-token" } });
  const body = await response.json() as { source: string; models: Array<{ slug: string }> };
  return { source: body.source, slugs: body.models.map(item => item.slug) };
};

describe("codex 모델 목록 API", () => {
  it("codex 의 최신 목록을 읽고 다른 제공자(`/` 가 든 slug)와 숨긴 모델은 뺀다", async () => {
    expect(await slugs(await fakeCodex(true))).toEqual({ source: "codex-cli", slugs: ["gpt-6-luna", "gpt-6.1-terra"] });
  });
  it("최신 목록을 읽지 못하면 실행 파일에 든 목록을 쓴다", async () => {
    expect(await slugs(await fakeCodex(false))).toEqual({ source: "codex-cli", slugs: ["gpt-6-luna", "gpt-6-sol"] });
  });
});

describe("Codex 계정 호환", () => {
  it("저장 모델이 목록에 없으면 선호 모델을 응답하고 GET에서는 저장하지 않는다", async () => {
    const { app, store } = await compatCodex({ saved: "gpt-5.5" });
    const response = await app.request("/api/system/codex-settings", { headers });
    expect(await response.json()).toEqual({ model: "gpt-6.1-sol", effort: "high", resolved: true });
    expect((await store.readSettings()).codexModel).toBe("gpt-5.5");
  });
  it("Luna 400 뒤 Sol로 재시도하고 성공 모델·완료 메시지를 저장한다", async () => {
    const { finish, calls, store } = await compatCodex();
    const job = await finish();
    expect(job.status, job.error ?? "완료").toBe("done");
    expect((await calls()).map(call => call.model)).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
    expect((await calls())[1]!.args).toContain('model_reasoning_effort="high"');
    expect(await store.readSettings()).toMatchObject({ codexModel: "gpt-6.1-sol", codexEffort: "high", scriptTone: "보존" });
    expect(job.message).toContain("모델 gpt-6-luna 를 쓸 수 없어 gpt-6.1-sol 로 바꿨어요");
    expect((await finish()).status).toBe("done");
    expect((await calls()).map(call => call.model)).toEqual(["gpt-6-luna", "gpt-6.1-sol", "gpt-6.1-sol"]);
  });
  it("목록 밖 저장 모델을 바꾼 실행도 완료 메시지를 반환한다", async () => {
    const { finish, calls, store } = await compatCodex({ saved: "gpt-5.5", failed: [] });
    const job = await finish();
    expect(job.status, job.error ?? "완료").toBe("done");
    expect((await calls()).map(call => call.model)).toEqual(["gpt-6.1-sol"]);
    expect((await store.readSettings()).codexModel).toBe("gpt-6.1-sol");
    expect(job.message).toContain("모델 gpt-5.5 를 쓸 수 없어 gpt-6.1-sol 로 바꿨어요");
  });
  it("최대 두 번만 재시도하고 모두 거절되면 계정·업데이트 안내를 반환한다", async () => {
    const { finish, calls, store } = await compatCodex({ failed: catalogSlugs });
    const job = await finish();
    expect(job.status).toBe("failed");
    expect(job.error).toBe("이 계정에서 쓸 수 있는 codex 모델이 없어요. codex 를 업데이트하거나 ChatGPT 플랜을 확인하세요");
    expect((await calls()).map(call => call.model)).toEqual(["gpt-6-luna", "gpt-6.1-sol", "gpt-6.1-terra"]);
    expect((await store.readSettings()).codexModel).toBe("gpt-6-luna");
  });
  it("사용 한도 오류는 재시도하지 않는다", async () => {
    const { finish, calls } = await compatCodex({ quota: true });
    const job = await finish();
    expect(job.status).toBe("failed"); expect(job.error).toContain("사용 한도");
    expect((await calls()).map(call => call.model)).toEqual(["gpt-6-luna"]);
  });
  it("설정과 목록 조회가 60초 캐시를 공유한다", async () => {
    const { app, root } = await compatCodex();
    const start = Date.now(), now = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      await app.request("/api/system/codex-settings", { headers });
      await app.request("/api/system/codex-models", { headers });
      await app.request("/api/system/codex-models", { headers });
      expect((await readFile(path.join(root, "catalog-calls"), "utf8")).trim().split("\n")).toHaveLength(1);
      now.mockReturnValue(start + 60_001);
      await app.request("/api/system/codex-models", { headers });
      expect((await readFile(path.join(root, "catalog-calls"), "utf8")).trim().split("\n")).toHaveLength(2);
    } finally { now.mockRestore(); }
  });
  it.each([["0.165.0", false], ["0.153.4", true]])("상태에 version=%s와 outdated=%s를 반환한다", async (version, outdated) => {
    const { app } = await compatCodex({ version });
    const response = await app.request("/api/system", { headers });
    expect(await response.json()).toMatchObject({ codex: { installed: true, loggedIn: true, version, outdated } });
  });
  it("낮은 CLI 버전에서는 대본 작업을 시작하지 않는다", async () => {
    const { recommend, jobs, calls } = await compatCodex({ version: "0.153.4" });
    const response = await recommend();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "codex-outdated", message: "codex 업데이트가 필요해요 (현재 0.153.4, 0.159.3 이상 필요)" } });
    expect(jobs.list()).toHaveLength(0); expect(await calls()).toEqual([]);
  });
  it("실행 파일과 목록이 없으면 Sol 기본값과 미확인 상태를 반환한다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-codex-missing-")); roots.push(root);
    const app = createApp({ store: new Store(root), jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null });
    expect(await (await app.request("/api/system/codex-settings", { headers })).json()).toEqual({ model: "gpt-6.1-sol", effort: "medium", resolved: false });
    expect(await slugs(app)).toEqual({ source: "fallback", slugs: ["gpt-6.1-sol"] });
    expect(await (await app.request("/api/system", { headers })).json()).toMatchObject({ codex: { installed: false, loggedIn: false, version: null, outdated: false } });
  });
});
