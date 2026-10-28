import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { startMediaServer } from "../../src/engine/pipeline/media-server";
import { Store } from "../../src/engine/store";
import { DEFAULT_BRAND_SETTINGS, Project } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";
import { ffmpeg, ffprobeBin, mediaBinDir, solidPng, toneWav } from "../helpers/media";

const fixtureRoot = path.resolve("tests/fixtures/project");
const token = "render-media-test-token";

describe("render route media", () => {
  it.each([0.5, 1, 2])("047 %s배는 미리보기와 같은 길이·캐시로 원본 시작과 끝 프레임을 렌더한다", async speed => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-speed-render-"));
    const store = new Store(root), jobs = new Jobs();
    const mediaServer = await startMediaServer({ roots: { projects: path.join(root, "projects"), library: path.join(root, "library"), brand: path.join(root, "brand") }, token });
    try {
      await store.init(); const p = await store.createProject("배속 렌더");
      p.inputs = [{ id: "i", kind: "video", file: "input/video.mp4", durationSec: 0.8 }];
      p.timeline.video = [{ id: "v", kind: "main", inputId: "i", inStartSec: 0, inEndSec: 0.8, speed }];
      await store.saveProject(p);
      // Windows 번들에는 color 필터가 없다. 12장씩 이어서 같은 0.8초 영상을 만든다.
      const red = solidPng(108, 192, [255, 0, 0]), blue = solidPng(108, 192, [0, 0, 255]);
      await Promise.all(Array.from({ length: 24 }, (_, index) => writeFile(path.join(root, `frame-${String(index).padStart(2, "0")}.png`), index < 12 ? red : blue)));
      await writeFile(path.join(root, "tone.wav"), toneWav(0.8));
      ffmpeg(["-y", "-framerate", "30", "-i", path.join(root, "frame-%02d.png"), "-i", path.join(root, "tone.wav"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(store.projectDir(p.id), "input/video.mp4")]);
      const app = createApp({ store, jobs, token, codexPath: async () => null, jevKey: async () => null, mediaServer });
      const outputPath = path.join(root, "render.mp4");
      const response = await app.request(`/api/projects/${p.id}/render`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ outputPath }) });
      expect(response.status).toBe(202); const final = await jobs.wait((await response.json() as { id: string }).id); expect(final.status, final.error ?? "").toBe("done");
      const saved = await store.requireProject(p.id), preview = timelineToRender(saved.timeline, undefined, saved.audioCache);
      const probe = JSON.parse(execFileSync(ffprobeBin, ["-v", "error", "-show_format", "-show_streams", "-of", "json", outputPath], { encoding: "utf8", cwd: mediaBinDir }));
      expect(Math.abs(Number(probe.format.duration) - preview.durationInFrames / 30)).toBeLessThanOrEqual(1 / 30);
      const pixel = (sec: number) => ffmpeg(["-ss", String(sec), "-i", outputPath, "-vf", "format=rgb24,crop=1:1:540:960", "-frames:v", "1", "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"]);
      expect(pixel(0)[0]).toBeGreaterThan(230); expect(pixel((preview.durationInFrames - 1) / 30)[2]).toBeGreaterThan(230);
      expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
      if (speed !== 1) { expect(saved.audioCache?.[`i:${speed}`]?.file).toMatch(/^cache\/audio\//); expect(preview.audio[0]?.file).toBe(saved.audioCache?.[`i:${speed}`]?.file); }
      console.log(`047 render speed=${speed} previewFrames=${preview.durationInFrames} mp4Duration=${probe.format.duration}s`);
    } finally { await jobs.shutdown(); await mediaServer.close(); await rm(root, { recursive: true, force: true }); }
  }, 90_000);
  it("renders a fixture project through the app media server", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-render-media-"));
    // U3_DATA_DIR may be relative in dev and manual checks; exercise that runtime shape.
    const store = new Store(path.relative(process.cwd(), root));
    const jobs = new Jobs();
    const mediaServer = await startMediaServer({
      roots: { projects: path.join(root, "projects"), library: path.join(root, "library"), brand: path.join(root, "brand") },
      token,
    });
    const app = createApp({ store, jobs, token, codexPath: async () => null, jevKey: async () => null, mediaServer });
    const project = Project.parse(JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8")));
    project.inputs = [{ id: "main-video", kind: "video", file: "input/video.mp4", durationSec: 4 }];
    project.timeline = {
      video: [{ id: "main-video-clip", kind: "main", inputId: "main-video", inStartSec: 0, inEndSec: 4, startTransition: { kind: { kind: "none" }, durationSec: 0.5 }, endTransition: { kind: { kind: "none" }, durationSec: 0.5 } }],
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
      await mkdir(path.join(root, "brand"), { recursive: true });
      await writeFile(path.join(root, "brand", "title.png"), solidPng(600, 100, [255, 0, 0]));
      await store.saveSettings({ brand: { ...DEFAULT_BRAND_SETTINGS, titleBar: { ...DEFAULT_BRAND_SETTINGS.titleBar, kind: "image", file: "title.png", bgColor: "#000000", bgOpacity: 1 } } });

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
      const pixel = (x: number, y: number) => ffmpeg(["-i", outputPath, "-vf", `format=rgb24,crop=1:1:${x}:${y}`, "-frames:v", "1", "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"]);
      // 600×100 이미지는 768×128로 가운데 그린다. 위 16px과 좌우 156px은 배경이다.
      const center = pixel(540, 80);
      expect(center[0]).toBeGreaterThan(240);
      expect(center[1]).toBeLessThan(15);
      expect(center[2]).toBeLessThan(15);
      expect([...pixel(540, 8)]).toEqual([0, 0, 0]);
      expect([...pixel(100, 80)]).toEqual([0, 0, 0]);
    } finally {
      await mediaServer.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
