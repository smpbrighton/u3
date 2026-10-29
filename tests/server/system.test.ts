import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Store } from "../../src/engine/store";
import { Jobs } from "../../src/engine/jobs";
afterEach(() => vi.unstubAllGlobals());
it("system은 엔진 platform과 capabilities를 반환한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-system-"));
  try {
    const store = new Store(root); await store.init();
    const app = createApp({ store, jobs: new Jobs(), token: "test", codexPath: async () => null, jevKey: async () => null });
    expect(await (await app.request("/api/system", { headers: { authorization: "Bearer test" } })).json()).toMatchObject({ logFile: path.join(root, "logs/engine.log") });
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(await (await app.request("/api/system", { headers: { authorization: "Bearer test" } })).json()).toMatchObject({ platform: "win32", capabilities: { tts: false } });
  } finally { await rm(root, { recursive: true, force: true }); }
});
