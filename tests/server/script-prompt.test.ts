import { createHash } from "node:crypto";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";
import type { PromptDefaults } from "../../src/core/default-prompts";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function appAt(promptDefaults?: () => Promise<PromptDefaults>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-script-prompt-"));
  roots.push(root);
  const store = new Store(root);
  const app = createApp({ promptDefaults, store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null });
  return { app, store };
}

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

describe("script prompt settings API", () => {
  it("기본 프롬프트 길이는 20000자 제한 안에 든다", () => {
    expect(DEFAULT_SCRIPT_PROMPT.length).toBeLessThanOrEqual(20000);
  });

  it("기본 프롬프트와 형식 규칙 미리보기를 반환한다", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-prompt", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      prompt: expect.stringMatching(/^영상 위에서 시청자에게 건네는 한국어 말을 장면별 자막으로 작성한다\./),
      isDefault: true,
      rulesPreview: expect.stringContaining("reaction이 null이 아닌 장면"),
    });
  });

  it("앞뒤 공백을 제거한 값을 저장하고 기본값 상태를 반환한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-prompt", {
      method: "PUT", headers, body: JSON.stringify({ prompt: "  나만의 지시문  " }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ prompt: "나만의 지시문", isDefault: false });
    expect(await store.readSettings()).toMatchObject({ scriptPrompt: "나만의 지시문" });
  });

  it("9000자를 저장하고 20001자는 거부한다", async () => {
    const { app, store } = await appAt();
    const accepted = await app.request("http://127.0.0.1/api/system/script-prompt", {
      method: "PUT", headers, body: JSON.stringify({ prompt: "가".repeat(9000) }),
    });
    expect(accepted.status).toBe(200);
    expect(await store.readSettings()).toMatchObject({ scriptPrompt: "가".repeat(9000) });

    const response = await app.request("http://127.0.0.1/api/system/script-prompt", {
      method: "PUT", headers, body: JSON.stringify({ prompt: "가".repeat(20001) }),
    });
    expect(response.status).toBe(400);
  });

  it("빈 값은 저장 키를 지우고 기본값으로 복원한다", async () => {
    const { app, store } = await appAt();
    await store.saveSettings({ codexModel: "keep", scriptPrompt: "custom" });
    const response = await app.request("http://127.0.0.1/api/system/script-prompt", {
      method: "PUT", headers, body: JSON.stringify({ prompt: "  " }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ isDefault: true });
    expect(await store.readSettings()).toEqual({ codexModel: "keep" });
  });
});

const remoteDefaults: PromptDefaults = { schema: 1, revision: 2, script: "원격 대본", carouselTopic: DEFAULT_CAROUSEL_TOPIC_PROMPT, carouselVideo: DEFAULT_CAROUSEL_VIDEO_PROMPT };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
describe("대본의 원격 기본값", () => {
  it("미수정 사용자는 갱신한 기본값을 따르고 PUT은 현재 기본값과 기준 hash를 반환한다", async () => {
    let defaults = remoteDefaults;
    const { app, store } = await appAt(async () => defaults);
    const get = async () => (await app.request("/api/system/script-prompt", { headers })).json();
    const put = async (prompt: string) => (await app.request("/api/system/script-prompt", { method: "PUT", headers, body: JSON.stringify({ prompt }) })).json();
    expect(await get()).toMatchObject({ prompt: defaults.script, defaultPrompt: defaults.script, isDefault: true, newerDefault: false });
    defaults = { ...defaults, revision: 3, script: "갱신한 원격 대본" };
    expect(await get()).toMatchObject({ prompt: defaults.script, defaultPrompt: defaults.script });
    expect(await put("  고친 대본  ")).toMatchObject({ prompt: "고친 대본", defaultPrompt: defaults.script, isDefault: false, newerDefault: false, rulesPreview: expect.any(String) });
    expect(await store.readSettings()).toEqual({ scriptPrompt: "고친 대본", scriptPromptBaseHash: hash(defaults.script) });
    defaults = { ...defaults, revision: 4, script: "다시 갱신한 원격 대본" };
    expect(await get()).toMatchObject({ prompt: "고친 대본", defaultPrompt: defaults.script, newerDefault: true });
    expect(await put(" ")).toMatchObject({ prompt: defaults.script, isDefault: true, newerDefault: false });
    expect(await store.readSettings()).toEqual({});
    await put("고친 대본");
    await put(defaults.script);
    expect(await store.readSettings()).toEqual({});
  });
  it("이전 버전에서 저장한 본문에 base hash가 없으면 표시하지 않는다", async () => {
    const { app, store } = await appAt(async () => remoteDefaults);
    await store.saveSettings({ scriptPrompt: DEFAULT_SCRIPT_PROMPT });
    expect(await (await app.request("/api/system/script-prompt", { headers })).json()).toMatchObject({ prompt: DEFAULT_SCRIPT_PROMPT, defaultPrompt: remoteDefaults.script, isDefault: false, newerDefault: false });
  });
});
