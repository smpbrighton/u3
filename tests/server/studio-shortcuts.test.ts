import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { DEFAULT_STUDIO_SHORTCUTS as defaults } from "../../src/core/studio-shortcuts";

const roots: string[] = [];
const headers = { authorization: "Bearer test", "content-type": "application/json" };
const endpoint = "/api/system/studio-shortcuts";
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const appFor = (store: Store) => createApp({ store, jobs: new Jobs(), token: "test", codexPath: async () => null, jevKey: async () => null });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-studio-shortcuts-")); roots.push(root);
  const store = new Store(root);
  return { store, app: appFor(store), file: path.join(root, "settings.json") };
}

describe("스튜디오 단축키 설정 API", () => {
  it("기본 표를 반환한다", async () => {
    const { app } = await setup();
    const response = await app.request(endpoint, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bindings: defaults });
  });

  it("다른 설정을 보존하고 새 Store에서도 저장 표를 읽는다", async () => {
    const { app, store } = await setup();
    await store.saveSettings({ scriptTone: "기존 말투", ttsSpeaker: "Sohee" });
    const bindings = { ...defaults, "split-pointer": "KeyX" };
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify(bindings) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bindings });
    expect(await store.readSettings()).toEqual({ scriptTone: "기존 말투", ttsSpeaker: "Sohee", studioShortcuts: bindings });
    expect(await (await appFor(new Store(store.root)).request(endpoint, { headers })).json()).toEqual({ bindings });
  });

  it("충돌은 동작과 오류를 반환하고 파일을 바꾸지 않는다", async () => {
    const { app, store, file } = await setup();
    await store.saveSettings({ scriptTone: "보존", studioShortcuts: defaults });
    const before = await readFile(file, "utf8");
    const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ ...defaults, group: "KeyS" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "shortcut-conflict", action: "split-playhead", conflict: { kind: "action", id: "group" }, message: "묶기에서 사용 중이에요" } });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("예약 조합과 불완전·비정규 표를 400으로 거부하고 파일을 보존한다", async () => {
    const { app, store, file } = await setup();
    await store.saveSettings({ scriptTone: "보존" });
    const before = await readFile(file, "utf8");
    const system = process.platform === "darwin" ? "Mod+KeyQ" : "Alt+F4";
    for (const bindings of [{ ...defaults, group: "Mod+KeyC" }, { ...defaults, group: system }, { ...defaults, group: "Slash" }, { ...defaults, group: "Delete" }, { ...defaults, group: 3 }, { group: "KeyG" }, null]) {
      const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify(bindings) });
      expect(response.status).toBe(400);
      expect(await readFile(file, "utf8")).toBe(before);
    }
    expect(await store.readSettings()).toEqual({ scriptTone: "보존" });
  });

  it("글 편집과 시스템 예약 오류를 구분한다", async () => {
    const { app } = await setup();
    for (const [chord, kind, message] of [["Mod+KeyC", "text", "글 편집에 사용하는 조합이에요"], ["Mod+KeyW", "system", "시스템에서 사용하는 조합이에요"]]) {
      const response = await app.request(endpoint, { method: "PUT", headers, body: JSON.stringify({ ...defaults, group: chord }) });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "shortcut-conflict", action: "group", conflict: { kind }, message } });
    }
  });

  it("잘못된 저장 파일과 중복 표는 기본 표로 읽고 부분 표는 채운다", async () => {
    const { app, store, file } = await setup();
    await store.saveSettings({ studioShortcuts: { group: "KeyC" } });
    expect(await (await app.request(endpoint, { headers })).json()).toEqual({ bindings: defaults });
    await store.saveSettings({ studioShortcuts: { group: "KeyG" } });
    expect(await (await app.request(endpoint, { headers })).json()).toEqual({ bindings: { ...defaults, group: "KeyG" } });
    await writeFile(file, "broken json");
    expect(await (await app.request(endpoint, { headers })).json()).toEqual({ bindings: defaults });
  });
});
