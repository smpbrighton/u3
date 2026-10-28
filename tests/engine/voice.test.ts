import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { Project } from "../../src/core/schema";
import * as media from "../../src/engine/pipeline/ffmpeg";

const fixtureRoot = path.resolve("tests/fixtures/project");
const token = "voice-test-token";

describe("voice upload route", () => {
  it("stores supported audio under voice and returns its measured duration", async () => {
    const probe = vi.spyOn(media, "ffprobe");
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-voice-upload-"));
    const store = new Store(path.relative(process.cwd(), root));
    const project = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
    const app = createApp({ store, jobs: new Jobs(), token, codexPath: async () => null, jevKey: async () => null });
    try {
      await store.init();
      await store.saveProject(project);
      const audio = await readFile(path.join(fixtureRoot, "input/ko-5s.wav"));
      const form = new FormData();
      form.set("file", new File([audio], "voice.wav", { type: "audio/wav" }));
      const response = await app.request(`/api/projects/${project.id}/voice`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });

      expect(response.status).toBe(201);
      const result = await response.json() as { file: string; durationSec: number };
      expect(result.file).toMatch(/^voice\/[a-f0-9]+\.wav$/);
      expect(result.durationSec).toBeGreaterThan(4.5);
      expect(result.durationSec).toBeLessThan(5.5);
      // 번들 ffprobe는 바이너리 폴더에서 실행하므로 상대 Store 경로를 넘기면 안 된다.
      expect(probe).toHaveBeenCalledWith(path.resolve(store.projectDir(project.id), result.file));
      expect((await readdir(path.join(store.projectDir(project.id), "voice"))).length).toBe(1);
    } finally {
      probe.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsupported file types", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-voice-type-"));
    const store = new Store(root);
    const project = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
    const app = createApp({ store, jobs: new Jobs(), token, codexPath: async () => null, jevKey: async () => null });
    try {
      await store.init();
      await store.saveProject(project);
      const form = new FormData();
      form.set("file", new File(["text"], "voice.txt", { type: "text/plain" }));
      const response = await app.request(`/api/projects/${project.id}/voice`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      expect(response.status).toBe(415);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
