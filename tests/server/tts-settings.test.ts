import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
const headers = { authorization: "Bearer test", "content-type": "application/json" };
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-tts-settings-")); roots.push(root);
  const store = new Store(root);
  return { store, app: createApp({ store, jobs: new Jobs(), token: "test", codexPath: async () => null, jevKey: async () => null }) };
}

describe("TTS 설정", () => {
  it("기본 화자 Sohee와 빈 지시를 반환한다", async () => {
    const { app } = await setup(); const response = await app.request("/api/system/tts-settings", { headers });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ speaker: "Sohee", instruct: "" });
  });
  it("다른 설정을 보존하고 화자·말투 지시를 저장한다", async () => {
    const { app, store } = await setup(); await store.saveSettings({ scriptTone: "기존 말투" });
    const value = { speaker: "Ryan", instruct: "차분하게 말해 주세요" };
    expect((await app.request("/api/system/tts-settings", { method: "PUT", headers, body: JSON.stringify(value) })).status).toBe(200);
    expect(await (await app.request("/api/system/tts-settings", { headers })).json()).toEqual(value);
    expect(await store.readSettings()).toMatchObject({ scriptTone: "기존 말투", ttsSpeaker: "Ryan", ttsInstruct: value.instruct });
  });
  it("지원하지 않는 화자와 4000자를 넘는 지시는 거부한다", async () => {
    const { app } = await setup();
    for (const value of [{ speaker: "Unknown", instruct: "" }, { speaker: "Sohee", instruct: "가".repeat(4001) }]) {
      expect((await app.request("/api/system/tts-settings", { method: "PUT", headers, body: JSON.stringify(value) })).status).toBe(400);
    }
  });
});
