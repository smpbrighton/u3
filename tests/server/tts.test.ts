import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { done, Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { fakeTts } from "../helpers/tts";

const roots: string[] = [];
const registries: Jobs[] = [];
const headers = { authorization: "Bearer test", "content-type": "application/json" };
afterEach(async () => { await Promise.all(registries.splice(0).map(jobs => jobs.shutdown())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup(mode: Parameters<typeof fakeTts>[1] = "ok", ready = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-tts-route-")); roots.push(root);
  const store = new Store(root); await store.init(); const jobs = new Jobs(); registries.push(jobs);
  const project = await store.createProject("TTS");
  project.inputs = [{ id: "v", kind: "video", file: "input/v.mp4", durationSec: 10 }]; await store.saveProject(project);
  const download = vi.fn(async () => path.join(root, "model"));
  const app = createApp({ store, jobs, token: "test", codexPath: async () => null, jevKey: async () => null,
    resourceDir: root, ttsPath: await fakeTts(root, mode), ttsServices: { ready: async () => ready, download } });
  const items = ["a", "b", "c"].map(captionId => ({ captionId, text: `자막 ${captionId}` }));
  const start = () => app.request(`/api/projects/${project.id}/tts`, { method: "POST", headers, body: JSON.stringify({ items }) });
  return { root, store, project, jobs, app, start, download, items };
}

describe("음성 만들기 API", () => {
  it("가짜 도우미의 결과 3개를 돌려주고 프로젝트 타임라인은 고치지 않는다", async () => {
    const x = await setup(); const before = await x.store.getProject(x.project.id);
    const response = await x.start(); expect(response.status).toBe(202);
    const job = await response.json() as { id: string };
    const finished = await x.jobs.wait(job.id);
    expect(finished.status).toBe("done");
    expect(finished.result).toEqual(x.items.map(item => ({ captionId: item.captionId, file: `voice/tts-${item.captionId}.wav`, durationSec: 1 })));
    expect((await x.store.getProject(x.project.id))?.timeline).toEqual(before?.timeline);
    for (const item of x.items) expect((await readFile(path.join(x.store.projectDir(x.project.id), `voice/tts-${item.captionId}.wav`))).length).toBeGreaterThan(44);
    expect(x.download).not.toHaveBeenCalled();
  });

  it("모델이 없으면 같은 작업에서 다운로드한 뒤 생성하고 단계를 알린다", async () => {
    const x = await setup("ok", false); const messages: string[] = [];
    x.jobs.subscribe(job => { if (job.message) messages.push(job.message); });
    const job = await (await x.start()).json() as { id: string };
    expect((await x.jobs.wait(job.id)).status).toBe("done"); expect(x.download).toHaveBeenCalledOnce();
    expect(messages.some(message => message.includes("받"))).toBe(true);
    expect(messages.some(message => message.includes("음성"))).toBe(true);
    const request = JSON.parse(await readFile(path.join(x.root, "request.json"), "utf8"));
    expect(request.model).toBe(path.join(x.root, "model"));
  });

  it("취소 시 프로세스와 부분 파일을 정리하며 이전 TTS 파일은 보존한다", async () => {
    const x = await setup("hang"); const old = path.join(x.store.projectDir(x.project.id), "voice/tts-a.wav"); await writeFile(old, "이전 음성");
    let release!: () => void; const partial = new Promise<void>(resolve => { release = resolve; });
    x.jobs.subscribe(job => { if ((job.progress ?? 0) > 0.2) release(); });
    const started = await (await x.start()).json() as { id: string };
    await partial;
    expect((await x.app.request(`/api/jobs/${started.id}`, { method: "DELETE", headers })).status).toBe(200);
    expect((await x.jobs.wait(started.id)).status).toBe("discarded");
    expect(await readFile(old, "utf8")).toBe("이전 음성");
    expect(await readdir(path.dirname(old))).toEqual(["tts-a.wav"]);
  });

  it.each(["render", "separate", "tts"] as const)("%s 작업 중에는 TTS·내보내기·음성 분리를 거부한다", async kind => {
    const x = await setup(); let release!: () => void;
    const blocked = x.jobs.start({ kind, key: "heavy-media", label: "다른 작업" }, async () => { await new Promise<void>(resolve => { release = resolve; }); return done(); });
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const responses = [await x.start(), await x.app.request(`/api/projects/${x.project.id}/render`, { method: "POST", headers, body: JSON.stringify({ outputPath: path.join(x.root, "output.mp4") }) }), await x.app.request(`/api/projects/${x.project.id}/inputs/v/separate`, { method: "POST", headers })];
      for (const response of responses) { expect(response.status).toBe(409); expect(await response.text()).toContain("다른 작업이 끝난 뒤"); }
    } finally { release(); await x.jobs.wait(blocked.id); }
  });

  it("중복 id와 프로젝트 밖 경로는 거부한다", async () => {
    const x = await setup();
    for (const items of [[{ captionId: "../escape", text: "문장" }], [x.items[0], x.items[0]]]) {
      expect((await x.app.request(`/api/projects/${x.project.id}/tts`, { method: "POST", headers, body: JSON.stringify({ items }) })).status).toBe(400);
    }
  });

  it("모델 상태와 설정의 TTS 받기 경로를 제공한다", async () => {
    const x = await setup("ok", false);
    expect(await (await x.app.request("/api/models", { headers })).json()).toMatchObject({ qwenTts: { available: false } });
    const response = await x.app.request("/api/models/download", { method: "POST", headers, body: JSON.stringify({ model: "qwen-tts" }) });
    expect(response.status).toBe(202); const started = await response.json() as { id: string };
    expect((await x.jobs.wait(started.id)).status).toBe("done"); expect(x.download).toHaveBeenCalledOnce();
  });
});
