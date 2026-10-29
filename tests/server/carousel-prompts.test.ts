import { BUNDLED_PROMPT_DEFAULTS } from "../../src/core/default-prompts";
import { createHash } from "node:crypto";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";
import type { PromptDefaults } from "../../src/core/default-prompts";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
const endpoint = "/api/system/carousel-prompts";
const state = (prompt: string, defaultPrompt: string) => ({ prompt, isDefault: prompt === defaultPrompt, defaultPrompt, newerDefault: false });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const defaults = {
  topic: state(DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_TOPIC_PROMPT),
  video: state(DEFAULT_CAROUSEL_VIDEO_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT),
};

async function appAt(promptDefaults?: () => Promise<PromptDefaults>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-carousel-prompts-")); roots.push(root);
  const store = new Store(root);
  const app = createApp({ promptDefaults, store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevKey: async () => null });
  return { app, store };
}

describe("캐러셀 기획 프롬프트 설정 API", () => {
  it("두 기본 프롬프트를 반환한다", async () => {
    const { app } = await appAt();
    const response = await app.request(endpoint, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(defaults);
  });

  it("주제만 저장하면 공백을 제거하고 영상 기본값과 다른 설정을 보존한다", async () => {
    const { app, store } = await appAt();
    await store.saveSettings({ codexModel: "keep", scriptPrompt: "대본 지침" });
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ topic: "  주제 지침  " }) });
    expect(response.status).toBe(200);
    const expected = { ...defaults, topic: state("주제 지침", DEFAULT_CAROUSEL_TOPIC_PROMPT) };
    expect(await response.json()).toEqual(expected);
    expect(await (await app.request(endpoint, { headers })).json()).toEqual(expected);
    expect(await store.readSettings()).toEqual({ codexModel: "keep", scriptPrompt: "대본 지침", carouselTopicPrompt: "주제 지침", carouselTopicPromptBaseHash: hash(DEFAULT_CAROUSEL_TOPIC_PROMPT) });
  });

  it("영상만 저장하면 저장된 주제와 다른 설정을 보존한다", async () => {
    const { app, store } = await appAt();
    await store.saveSettings({ carouselTopicPrompt: "유지할 주제", imageOptions: { concurrency: 4 } });
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ video: "  영상 지침  " }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ topic: state("유지할 주제", DEFAULT_CAROUSEL_TOPIC_PROMPT), video: state("영상 지침", DEFAULT_CAROUSEL_VIDEO_PROMPT) });
    expect(await store.readSettings()).toEqual({ carouselTopicPrompt: "유지할 주제", carouselVideoPrompt: "영상 지침", carouselVideoPromptBaseHash: hash(DEFAULT_CAROUSEL_VIDEO_PROMPT), imageOptions: { concurrency: 4 } });
  });

  it.each([
    ["topic", "carouselTopicPrompt", DEFAULT_CAROUSEL_TOPIC_PROMPT],
    ["video", "carouselVideoPrompt", DEFAULT_CAROUSEL_VIDEO_PROMPT],
  ] as const)("%s의 빈 값과 기본값은 해당 키만 삭제한다", async (kind, key, fallback) => {
    const { app, store } = await appAt();
    const otherKind = kind === "topic" ? "video" : "topic";
    const otherKey = kind === "topic" ? "carouselVideoPrompt" : "carouselTopicPrompt";
    for (const value of [" \n\t ", `  ${fallback}  `]) {
      await store.saveSettings({ codexModel: "keep", [key]: "지울 값", [otherKey]: "유지할 값" });
      const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ [kind]: value }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ [kind]: defaults[kind], [otherKind]: state("유지할 값", defaults[otherKind].prompt) });
      expect(await store.readSettings()).toEqual({ codexModel: "keep", [otherKey]: "유지할 값" });
    }
  });

  it("두 키를 함께 저장하고 빈 요청은 현재 값을 유지한다", async () => {
    const { app, store } = await appAt();
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ topic: "주제", video: "영상" }) });
    expect(response.status).toBe(200);
    const expected = { topic: state("주제", DEFAULT_CAROUSEL_TOPIC_PROMPT), video: state("영상", DEFAULT_CAROUSEL_VIDEO_PROMPT) };
    expect(await response.json()).toEqual(expected);
    const unchanged = await app.request(endpoint, { method: "PUT", headers, body: "{}" });
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toEqual(expected);
    expect(await store.readSettings()).toEqual({ carouselTopicPrompt: "주제", carouselTopicPromptBaseHash: hash(DEFAULT_CAROUSEL_TOPIC_PROMPT), carouselVideoPrompt: "영상", carouselVideoPromptBaseHash: hash(DEFAULT_CAROUSEL_VIDEO_PROMPT) });
  });

  it.each(["topic", "video"] as const)("%s는 20000자까지 저장하고 초과 값과 문자열 외 값은 거부한다", async kind => {
    const { app, store } = await appAt();
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ [kind]: "가".repeat(20_000) }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ [kind]: { prompt: "가".repeat(20_000), isDefault: false } });
    const before = await store.readSettings();
    for (const invalid of ["가".repeat(20_001), null, 42]) {
      const rejected = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ [kind]: invalid }) });
      expect(rejected.status).toBe(400);
      expect(await store.readSettings()).toEqual(before);
    }
  });

  it("저장된 설정이 빈 문자열이거나 문자열이 아니면 기본값을 반환한다", async () => {
    const { app, store } = await appAt();
    await store.saveSettings({ carouselTopicPrompt: " \n ", carouselVideoPrompt: 42 });
    const response = await app.request(endpoint, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(defaults);
  });
});

describe("캐러셀의 원격 기본값", () => {
  it("세 프롬프트 중 바뀐 본문의 수정 사용자에게만 표시하고 초기화는 기준 hash도 지운다", async () => {
    let current: PromptDefaults = { ...BUNDLED_PROMPT_DEFAULTS, schema: 1, revision: 2, script: DEFAULT_SCRIPT_PROMPT, carouselTopic: "원격 주제", carouselVideo: "원격 영상" };
    const { app, store } = await appAt(async () => current);
    const get = async () => (await app.request(endpoint, { headers })).json();
    const put = async (body: unknown) => (await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify(body) })).json();
    expect(await get()).toEqual({ topic: state(current.carouselTopic, current.carouselTopic), video: state(current.carouselVideo, current.carouselVideo) });
    current = { ...current, revision: 3, carouselTopic: "새 원격 주제" };
    expect(await get()).toMatchObject({ topic: { prompt: current.carouselTopic }, video: { prompt: current.carouselVideo } });
    await put({ topic: "내 주제", video: "내 영상" });
    expect(await store.readSettings()).toEqual({ carouselTopicPrompt: "내 주제", carouselTopicPromptBaseHash: hash(current.carouselTopic), carouselVideoPrompt: "내 영상", carouselVideoPromptBaseHash: hash(current.carouselVideo) });
    current = { ...current, revision: 4, carouselVideo: "새 원격 영상" };
    expect(await get()).toEqual({ topic: state("내 주제", current.carouselTopic), video: { ...state("내 영상", current.carouselVideo), newerDefault: true } });
    await put({ video: "" });
    expect(await store.readSettings()).toEqual({ carouselTopicPrompt: "내 주제", carouselTopicPromptBaseHash: hash(current.carouselTopic) });
    await put({ topic: current.carouselTopic });
    expect(await store.readSettings()).toEqual({});
    await store.saveSettings({ carouselVideoPrompt: "옛 수정 본문" });
    expect(await get()).toMatchObject({ video: { prompt: "옛 수정 본문", newerDefault: false } });
  });
});
