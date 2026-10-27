import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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
