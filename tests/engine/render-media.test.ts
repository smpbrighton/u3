import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { startMediaServer } from "../../src/engine/pipeline/media-server";
import { Store } from "../../src/engine/store";
import { Project } from "../../src/core/schema";

const fixtureRoot = path.resolve("tests/fixtures/project");
const token = "render-media-test-token";

describe("render route media", () => {
  it("renders a fixture project through the app media server", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-render-media-"));
    // U3_DATA_DIR may be relative in dev and manual checks; exercise that runtime shape.
    const store = new Store(path.relative(process.cwd(), root));
    const jobs = new Jobs();
    const mediaServer = await startMediaServer({
      roots: { projects: path.join(root, "projects"), library: path.join(root, "library") },
      token,
    });
    const app = createApp({ store, jobs, token, codexPath: async () => null, jevAvailable: false, mediaServer });
    const project = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
    project.inputs = [{ id: "main-video", kind: "video", file: "input/video.mp4", durationSec: 4 }];
    project.timeline = {
      video: [{ id: "main-video-clip", kind: "main", inputId: "main-video", inStartSec: 0, inEndSec: 4 }],
      overlays: [],
      captions: [],
      voice: [],
      sfx: [],
      audio: {
        source: { gain: 1, muted: false },
        voice: { gain: 1, muted: false },
        sfx: { gain: 1, muted: false },
      },
    };

    try {
      await store.init();
      await store.saveProject(project);
      await copyFile(
        path.join(fixtureRoot, "input/video.mp4"),
        path.join(store.projectDir(project.id), "input/video.mp4"),
      );
      const outputPath = path.join(root, "render.mp4");
      const response = await app.request(`/api/projects/${project.id}/render`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ outputPath }),
      });
      expect(response.status).toBe(202);
      const started = await response.json() as { id: string };
      let final = jobs.get(started.id);
      const deadline = Date.now() + 60_000;
      while (final && ["queued", "running"].includes(final.status) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        final = jobs.get(started.id);
      }
      expect(final?.status).toBe("done");
      expect((await stat(outputPath)).size).toBeGreaterThan(0);
    } finally {
      await mediaServer.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
