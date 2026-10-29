import { createHash } from "node:crypto";
import { BUNDLED_PROMPT_DEFAULTS as bundled, type PromptDefaults } from "../../src/core/default-prompts";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function appAt(promptDefaults?: () => Promise<PromptDefaults>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-script-voice-"));
  roots.push(root);
  const store = new Store(root);
  return { app: createApp({ promptDefaults, store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null }), store };
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const state = (prompt: string, defaultPrompt: string) => ({ prompt, defaultPrompt, isDefault: prompt === defaultPrompt, newerDefault: false });
const defaults = { tone: state(bundled.tone, bundled.tone), persona: state(bundled.persona, bundled.persona) };

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

describe("script voice settings API", () => {
  it("말투와 성격 기본 설정을 반환한다", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(defaults);
  });

  it("4000자와 빈 값을 저장한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "가".repeat(4000) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...defaults, persona: state("가".repeat(4000), bundled.persona) });
    expect(await store.readSettings()).toEqual({ scriptPersona: "가".repeat(4000), scriptPersonaBaseHash: hash(bundled.persona) });
  });

  it("말투·성격이 4000자를 넘으면 거부한다", async () => {
    const { app } = await appAt();
    for (const field of ["tone", "persona"]) {
      const response = await app.request("http://127.0.0.1/api/system/script-voice", {
        method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "", [field]: "가".repeat(4001) }),
      });
      expect(response.status).toBe(400);
    }
  });

  it("옛 scriptReview 값을 응답과 저장 요청에서 무시하고 저장 파일에는 보존한다", async () => {
    const { app, store } = await appAt();
    await store.saveSettings({ scriptReview: "기존 검수 지시문", codexModel: "keep" });
    const initial = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
    expect(await initial.json()).toEqual(defaults);
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "말투", persona: "성격", review: "무시할 새 검수 값" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: state("말투", bundled.tone), persona: state("성격", bundled.persona) });
    expect(await store.readSettings()).toEqual({ scriptReview: "기존 검수 지시문", codexModel: "keep", scriptTone: "말투", scriptToneBaseHash: hash(bundled.tone), scriptPersona: "성격", scriptPersonaBaseHash: hash(bundled.persona) });
  });
});

it("옛 화자 값을 읽지 않고 저장 파일에서는 보존한다", async () => {
  const { app, store } = await appAt();
  await store.saveSettings({ scriptSpeaker: "기존 화자" });
  const initial = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
  expect(await initial.json()).not.toHaveProperty("speaker");
  const response = await app.request("http://127.0.0.1/api/system/script-voice", {
    method: "PUT", headers, body: JSON.stringify({ speaker: "새 화자", tone: "말투", persona: "" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).not.toHaveProperty("speaker");
  expect(await store.readSettings()).toMatchObject({ scriptSpeaker: "기존 화자", scriptTone: "말투" });
});

it.each(["tone", "persona"] as const)("%s는 원격 기본값을 따르고 수정·새 기본값 표시·초기화를 지원한다", async kind => {
  let current = { ...bundled, revision: 3, tone: "원격 말투", persona: "원격 성격" };
  const { app, store } = await appAt(async () => current);
  const endpoint = "/api/system/script-voice";
  const get = async () => (await app.request(endpoint, { headers })).json();
  const put = async (body: unknown) => {
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    return response.json();
  };
  const other = kind === "tone" ? "persona" : "tone";
  const key = kind === "tone" ? "scriptTone" : "scriptPersona";
  const baseKey = `${key}BaseHash`;
  expect(await get()).toMatchObject({ [kind]: state(current[kind], current[kind]) });
  current = { ...current, revision: 4, [kind]: "새 기본값" };
  expect(await get()).toMatchObject({ [kind]: state(current[kind], current[kind]) });
  await store.saveSettings({ codexModel: "keep" });
  expect(await put({ [kind]: "  내 설정  " })).toEqual({ [kind]: state("내 설정", current[kind]), [other]: state(current[other], current[other]) });
  expect(await store.readSettings()).toEqual({ codexModel: "keep", [key]: "내 설정", [baseKey]: hash(current[kind]) });
  current = { ...current, revision: 5, [kind]: "더 새 기본값" };
  expect(await get()).toEqual({ [kind]: { ...state("내 설정", current[kind]), newerDefault: true }, [other]: state(current[other], current[other]) });
  expect(await put({ [kind]: " " })).toMatchObject({ [kind]: state(current[kind], current[kind]) });
  expect(await store.readSettings()).toEqual({ codexModel: "keep" });
  await put({ [kind]: "내 설정" });
  await put({ [kind]: current[kind] });
  expect(await store.readSettings()).toEqual({ codexModel: "keep" });
  await store.saveSettings({ [key]: "옛 설정" });
  expect(await get()).toMatchObject({ [kind]: { prompt: "옛 설정", newerDefault: false } });
  await store.saveSettings({ [key]: " " });
  expect(await get()).toMatchObject({ [kind]: state(current[kind], current[kind]) });
});
