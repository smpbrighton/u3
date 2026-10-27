import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs, done, type JobKind } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-update-busy-")); roots.push(root);
  const jobs = new Jobs();
  const app = createApp({ store: new Store(root), jobs, token: "test-token", codexPath: async () => null, jevAvailable: false });
  const busy = async () => (await app.request("http://127.0.0.1/api/system/busy", { headers: { authorization: "Bearer test-token" } })).json();
  return { app, jobs, busy };
}

describe("업데이트 전 엔진 작업 확인", () => {
  it.each<JobKind>(["script", "render", "transcribe", "separate", "models", "image", "frames", "meme-rank"])("%s 작업의 대기·실행·종료 상태를 구분한다", async kind => {
    const { jobs, busy } = await setup();
    expect(await busy()).toMatchObject({ busy: false, jobs: [] });
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const job = jobs.start({ kind, label: "진행 중", queued: true }, async () => { await gate; return done(); });
    try { expect(await busy()).toMatchObject({ busy: true, jobs: [{ id: job.id, kind }] }); }
    finally { finish(); await jobs.wait(job.id); }
    expect(await busy()).toMatchObject({ busy: false, jobs: [] });
  });

  it("취소했지만 아직 멈추는 작업도 포함한다", async () => {
    const { jobs, busy } = await setup();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const job = jobs.start({ kind: "render", label: "렌더", cancellable: true }, async () => { await gate; return done(); });
    await new Promise(resolve => setTimeout(resolve, 5));
    jobs.cancel(job.id);
    try { expect(await busy()).toMatchObject({ busy: true, jobs: [{ stopping: true }] }); }
    finally { finish(); await jobs.wait(job.id); }
    expect(await busy()).toMatchObject({ busy: false });
  });

  it("토큰 없는 요청을 거절한다", async () => {
    const { app } = await setup();
    expect((await app.request("http://127.0.0.1/api/system/busy")).status).toBe(401);
  });
});
