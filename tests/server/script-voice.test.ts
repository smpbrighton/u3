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
  return { app: createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevAvailable: false }), store };
}

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

describe("script voice settings API", () => {
  it("기본 설정을 반환하고 검수 프롬프트 기본값을 채운다", async () => {
    const { app } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ speaker: "", tone: "", persona: "", review: DEFAULT_SCRIPT_REVIEW_PROMPT });
  });

  it("4000자와 빈 값을 저장하고 빈 검수 값은 기본값으로 응답한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request("http://127.0.0.1/api/system/script-voice", {
      method: "PUT", headers, body: JSON.stringify({ speaker: "가".repeat(4000), tone: "", persona: "성격", review: "" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ speaker: "가".repeat(4000), tone: "", persona: "성격", review: DEFAULT_SCRIPT_REVIEW_PROMPT });
    expect(await store.readSettings()).toMatchObject({ scriptSpeaker: "가".repeat(4000), scriptTone: "", scriptPersona: "성격", scriptReview: "" });
  });

  it("각 설정이 4000자를 넘으면 거부한다", async () => {
    const { app } = await appAt();
    for (const field of ["speaker", "tone", "persona", "review"]) {
      const response = await app.request("http://127.0.0.1/api/system/script-voice", {
        method: "PUT", headers, body: JSON.stringify({ speaker: "", tone: "", persona: "", review: "", [field]: "가".repeat(4001) }),
      });
      expect(response.status).toBe(400);
    }
  });
});
