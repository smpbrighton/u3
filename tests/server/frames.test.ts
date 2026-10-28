import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Store } from "../../src/engine/store";
import { Jobs } from "../../src/engine/jobs";
import { CodexScript, type Input } from "../../src/core/schema";

const { extractFrames, ffprobe, runScript, imagesForCodex } = vi.hoisted(() => ({ extractFrames: vi.fn(), ffprobe: vi.fn(), runScript: vi.fn(), imagesForCodex: [] as string[] }));
vi.mock("../../src/engine/pipeline/frames", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/engine/pipeline/frames")>(), extractFrames,
}));
vi.mock("../../src/engine/pipeline/ffmpeg", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/engine/pipeline/ffmpeg")>(), ffprobe,
}));
vi.mock("../../src/engine/pipeline/codex", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/engine/pipeline/codex")>(), codexCliRunner: () => ({ runScript }),
}));

const roots: string[] = [];
beforeEach(() => {
  imagesForCodex.length = 0;
  extractFrames.mockReset().mockImplementation(async (_source: string, directory: string, count: number) => Array.from({ length: count }, (_, index) => path.join(directory, `frame-${index + 1}.jpg`)));
  ffprobe.mockReset().mockResolvedValue({ streams: [], format: { duration: "3.6" } });
  runScript.mockReset().mockImplementation(async (request: { prepareImages: () => Promise<string[]> }) => {
    imagesForCodex.push(...await request.prepareImages());
    return { output: CodexScript.parse({ scenes: [{ inputIndex: 1, startSec: 0, endSec: 1, caption: "직접 써 봤어. 너는 어때? 😊", reaction: null, sfxCategory: null }] }), usage: {}, transcriptWarnings: [] };
  });
});
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function setup(inputs: Input[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-frame-routes-")); roots.push(root);
  const store = new Store(root);
  const project = await store.createProject("프레임 테스트");
  await store.saveProject({ ...project, inputs });
  const jobs = new Jobs();
  const app = createApp({ store, jobs, token: "token", codexPath: async () => "fake-codex", jevKey: async () => null, resourceDir: path.join(root, "resources") });
  const request = (suffix: string, body = {}) => app.request(`/api/projects/${project.id}/${suffix}`, { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(body) });
  return { request, jobs };
}

const longVideos = () => Array.from({ length: 20 }, (_, index): Input => ({ id: `v${index}`, kind: "video", file: `input/video-${index}.mp4`, durationSec: 12 }));

describe("입력별 프레임 규칙의 HTTP 호출부", () => {
  it("기존 프레임 경로에서 영상 20개의 200장을 반환한다", async () => {
    const { request } = await setup(longVideos());
    const response = await request("frames");
    expect(response.status).toBe(200);
    const groups = await response.json() as Array<{ inputId: string; frames: Array<{ file: string; url: string }> }>;
    expect(groups.map(group => group.frames.length)).toEqual(Array(20).fill(10));
    expect(groups.flatMap(group => group.frames)).toHaveLength(200);
    expect(groups[0]!.frames[0]!.url).toContain("token=");
    expect(extractFrames).toHaveBeenCalledTimes(20);
  });

  it("영상 길이가 없으면 확인한 뒤 사진 1장과 영상별 장 수를 반환한다", async () => {
    const { request } = await setup([{ id: "v1", kind: "video", file: "v1.mp4" }, { id: "p1", kind: "photo", file: "p1.jpg" }, { id: "v2", kind: "video", file: "v2.mp4", durationSec: 9.7 }]);
    const response = await request("frames");
    expect(response.status).toBe(200);
    expect((await response.json() as Array<{ frames: unknown[] }>).map(group => group.frames.length)).toEqual([4, 1, 10]);
    expect(ffprobe).toHaveBeenCalledOnce();
    expect(extractFrames.mock.calls.map(call => call[2])).toEqual([4, 1, 10]);
  });

  it("대본 생성에도 200장을 전달하고 영상별 10장 시각을 안내한다", async () => {
    const { request, jobs } = await setup(longVideos());
    const response = await request("script/recommend", { mode: "ai" });
    expect(response.status).toBe(202);
    const job = await jobs.wait((await response.json() as { id: string }).id);
    expect(job.status, job.error ?? "생성 완료").toBe("done");
    expect(imagesForCodex).toHaveLength(200);
    expect(extractFrames.mock.calls.map(call => call[2])).toEqual(Array(20).fill(10));
    expect(runScript.mock.calls[0]![0].prompt).toContain("프레임 시각: 0.6초, 1.8초, 3.0초, 4.2초, 5.4초, 6.6초, 7.8초, 9.0초, 10.2초, 11.4초");
  });

  it("대본 생성에서 사진 뒤 영상의 장 수와 시각을 같은 입력에 연결한다", async () => {
    const { request, jobs } = await setup([{ id: "v1", kind: "video", file: "v1.mp4", durationSec: 3.6 }, { id: "p1", kind: "photo", file: "p1.jpg" }, { id: "v2", kind: "video", file: "v2.mp4", durationSec: 12 }]);
    const response = await request("script/recommend", { mode: "ai" });
    const job = await jobs.wait((await response.json() as { id: string }).id);
    expect(job.status, job.error ?? "생성 완료").toBe("done");
    expect(extractFrames.mock.calls.map(call => call[2])).toEqual([4, 1, 10]);
    expect(imagesForCodex).toHaveLength(15);
    const prompt = runScript.mock.calls[0]![0].prompt;
    expect(prompt).toContain("프레임 시각: 0.5초, 1.4초, 2.3초, 3.1초");
    expect(prompt).toContain('입력 항목 2: 사진, 파일 "p1.jpg"; 첨부 이미지 1장');
  });
});
