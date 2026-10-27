import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function appAt() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-script-voice-"));
  roots.push(root);
  const store = new Store(root);
  return { app: createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null }), store };
}

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

describe("script voice settings API", () => {
  it("말투와 성격 기본 설정을 반환한다", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: "", persona: "" });
  });

  it("4000자와 빈 값을 저장한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "가".repeat(4000) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: "", persona: "가".repeat(4000) });
    expect(await store.readSettings()).toEqual({ scriptTone: "", scriptPersona: "가".repeat(4000) });
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
    expect(await initial.json()).toEqual({ tone: "", persona: "" });
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "말투", persona: "성격", review: "무시할 새 검수 값" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: "말투", persona: "성격" });
    expect(await store.readSettings()).toEqual({ scriptReview: "기존 검수 지시문", codexModel: "keep", scriptTone: "말투", scriptPersona: "성격" });
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
