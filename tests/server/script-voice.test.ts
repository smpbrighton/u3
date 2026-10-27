import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_SCRIPT_REVIEW_PROMPT } from "../../src/core/script-review";

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
  it("기본 자막 검수 지시문 길이는 20000자 제한 안에 든다", () => {
    expect(DEFAULT_SCRIPT_REVIEW_PROMPT.length).toBeLessThanOrEqual(20000);
  });

  it("기본 설정을 반환하고 검수 프롬프트 기본값을 채운다", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: "", persona: "", review: DEFAULT_SCRIPT_REVIEW_PROMPT });
  });

  it("4000자와 빈 값을 저장하고 빈 검수 값은 기본값으로 응답한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "성격", review: "" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tone: "", persona: "성격", review: DEFAULT_SCRIPT_REVIEW_PROMPT });
    expect(await store.readSettings()).toMatchObject({ scriptTone: "", scriptPersona: "성격", scriptReview: "" });
  });

  it("말투·성격이 4000자를 넘으면 거부한다", async () => {
    const { app } = await appAt();
    for (const field of ["tone", "persona"]) {
      const response = await app.request("http://127.0.0.1/api/system/script-voice", {
        method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "", review: "", [field]: "가".repeat(4001) }),
      });
      expect(response.status).toBe(400);
    }
  });

  it("자막 검수 지시문은 9000자를 저장하고 20001자는 거부한다", async () => {
    const { app, store } = await appAt();
    const accepted = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "", review: "가".repeat(9000) }),
    });
    expect(accepted.status).toBe(200);
    expect(await store.readSettings()).toMatchObject({ scriptReview: "가".repeat(9000) });

    const rejected = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ tone: "", persona: "", review: "가".repeat(20001) }),
    });
    expect(rejected.status).toBe(400);
  });
});

it("옛 화자 값을 읽지 않고 저장 파일에서는 보존한다", async () => {
  const { app, store } = await appAt();
  await store.saveSettings({ scriptSpeaker: "기존 화자" });
  const initial = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
  expect(await initial.json()).not.toHaveProperty("speaker");
  const response = await app.request("http://127.0.0.1/api/system/script-voice", {
    method: "PUT", headers, body: JSON.stringify({ speaker: "새 화자", tone: "말투", persona: "", review: "" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).not.toHaveProperty("speaker");
  expect(await store.readSettings()).toMatchObject({ scriptSpeaker: "기존 화자", scriptTone: "말투" });
});
