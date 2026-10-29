import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "../../src/engine/app";
import { Jobs, done } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { fakeTts } from "../helpers/tts";
const headers = { authorization: "Bearer test", "content-type": "application/json" };
const roots: string[] = [], registries: Jobs[] = [];
afterEach(async () => { await Promise.all(registries.splice(0).map(j => j.shutdown())); await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-prepare-")); roots.push(root);
  const store = new Store(root); await store.init(); const jobs = new Jobs(); registries.push(jobs);
  const project = await store.createProject("배속");
  project.timeline.voice = [{ id: "a", file: "voice/a.wav", startSec: 0, inStartSec: 0, inEndSec: 2, gain: 1 }];
  await store.saveProject(project);
  const b = Buffer.alloc(44 + 192000); b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(192000, 40);
  for (let i = 0; i < 96000; i++) b.writeInt16LE(Math.round(10000 * Math.sin(i * 2 * Math.PI * 440 / 48000)), 44 + i * 2);
  const file = path.join(store.projectDir(project.id), "voice/a.wav"); await writeFile(file, b);
  const run = vi.fn();
  const app = createApp({ store, jobs, token: "test", codexPath: async () => null, jevKey: async () => null, ttsServices: { run } });
  const request = (sourceId = "voice/a.wav", speed = 2) => app.request(`/api/projects/${project.id}/audio/prepare`, { method: "POST", headers, body: JSON.stringify({ sourceId, speed }) });
  const prepare = async (speed = 2) => { const response = await request("voice/a.wav", speed); expect(response.status).toBe(202); const { id } = await response.json() as { id: string }; return jobs.wait(id); };
  return { root, store, project, jobs, app, file, run, request, prepare };
}
describe("047 음성 준비 API", () => {
  it("TTS 없이 배속별 캐시를 만들고 원본·타임라인을 보존하며 중복은 재사용한다", async () => {
    const x = await setup(), before = await readFile(x.file);
    const [a, b] = await Promise.all([x.prepare(2), x.prepare(2)]);
    expect(a.status).toBe("done"); expect(b.result).toEqual(a.result); expect(x.run).not.toHaveBeenCalled();
    const slow = await x.prepare(0.5); expect(slow.status).toBe("done"); expect(slow.result).not.toEqual(a.result);
    expect(await readFile(x.file)).toEqual(before);
    expect((await x.store.requireProject(x.project.id)).timeline).toEqual(x.project.timeline);
    expect((await readdir(path.join(x.store.projectDir(x.project.id), "cache/audio"))).filter(f => !f.startsWith("."))).toHaveLength(2);
    const p = await x.store.requireProject(x.project.id); p.timeline.voice[0]!.inStartSec = 0.5; await x.store.saveProject(p);
    expect((await x.prepare(2)).result).toEqual(a.result);
    await writeFile(x.file, Buffer.concat([before, Buffer.alloc(2)]));
    const changed = await x.prepare(2); expect(changed.status).toBe("done"); expect((changed.result as { version: string }).version).not.toBe((a.result as { version: string }).version);
  }, 30_000);
  it("다른 heavy-media 작업이 끝난 뒤 실행하며 취소는 이전 Timeline을 보존한다", async () => {
    const x = await setup(); let release!: () => void;
    const other = x.jobs.start({ kind: "separate", key: "heavy-media", label: "분리" }, async () => { await new Promise<void>(r => { release = r; }); return done(); });
    await new Promise(r => setTimeout(r, 0));
    let settled = false; const request = Promise.resolve(x.request()).then(r => { settled = true; return r; });
    await new Promise(r => setTimeout(r, 30)); expect(settled).toBe(false);
    release(); await x.jobs.wait(other.id);
    const response = await request; expect(response.status).toBe(202);
    const { id } = await response.json() as { id: string }; x.jobs.cancel(id);
    expect((await x.jobs.wait(id)).status).toBe("discarded");
    expect((await x.store.requireProject(x.project.id)).timeline).toEqual(x.project.timeline);
  });
  it("절대 경로·미등록 원본·범위 밖 배속을 거절한다", async () => {
    const x = await setup();
    for (const source of ["/tmp/a.wav", "C:\\a.wav", "../a.wav", "voice/missing.wav"]) expect((await x.request(source)).status).toBe(400);
    for (const speed of [0, 0.49, 2.01]) expect((await x.request("voice/a.wav", speed)).status).toBe(400);
  });
  it("프로젝트를 처음 열 때 미참조 캐시·세대 파일만 정리한다", async () => {
    const x = await setup(), p = x.store.projectDir(x.project.id); await mkdir(path.join(p, "cache/audio"), { recursive: true });
    await writeFile(path.join(p, "cache/audio/keep.wav"), "keep"); await writeFile(path.join(p, "cache/audio/remove.wav"), "remove"); await writeFile(path.join(p, "voice/tts-old.wav"), "old");
    x.project.audioCache = { "voice/a.wav:2": { file: "cache/audio/keep.wav", durationSec: 1, version: "v" } }; await x.store.saveProject(x.project);
    expect((await x.app.request(`/api/projects/${x.project.id}`, { headers })).status).toBe(200);
    expect(await readdir(path.join(p, "cache/audio"))).toEqual(["keep.wav"]);
    expect(await readdir(path.join(p, "voice"))).toEqual(["a.wav"]);
  });
  it.skipIf(process.platform === "win32")("TTS 재생성은 불변 원본과 배속 캐시를 같은 job에서 준비한다 (Mac 전용: Windows TTS 미지원)", async () => {
    const x = await setup(); x.project.timeline.voice = [{ ...x.project.timeline.voice[0]!, id: "tts-a", speed: 2 }]; await x.store.saveProject(x.project);
    const app = createApp({ store: x.store, jobs: x.jobs, token: "test", codexPath: async () => null, jevKey: async () => null, ttsPath: await fakeTts(x.root), ttsServices: { ready: async () => true } });
    const request = () => app.request(`/api/projects/${x.project.id}/tts`, { method: "POST", headers, body: JSON.stringify({ items: [{ captionId: "a", text: "문장" }] }) });
    const first = await x.jobs.wait((await (await request()).json() as { id: string }).id); expect(first.status).toBe("done");
    const second = await x.jobs.wait((await (await request()).json() as { id: string }).id); expect(second.status).toBe("done");
    const a = (first.result as Array<{ file: string; cache: { file: string; durationSec: number } }>)[0]!;
    const b = (second.result as Array<{ file: string }>)[0]!;
    expect(a.file).not.toBe(b.file); expect(a.file).toMatch(/^voice\/tts-a-.+\.wav$/);
    expect(a.cache.durationSec).toBeCloseTo(0.5, 1); expect(await readFile(path.join(x.store.projectDir(x.project.id), a.cache.file))).toBeTruthy();
    expect(await readFile(path.join(x.store.projectDir(x.project.id), a.file))).toBeTruthy();
  });
});
