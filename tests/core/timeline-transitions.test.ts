import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Project } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";
import { transitionStyleAt } from "../../src/core/timeline/transitions";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/project");

describe("클립 전환 효과", () => {
  it("기존 project.json은 시작·끝 효과를 없음으로 읽는다", async () => {
    const raw = JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8"));
    for (const clip of raw.timeline.video as Record<string, unknown>[]) {
      delete clip.startTransition;
      delete clip.endTransition;
    }
    const project = Project.parse(raw);
    expect(project.timeline.video[0]?.startTransition).toEqual({ kind: { kind: "none" }, durationSec: 0.5 });
    expect(project.timeline.video[0]?.endTransition).toEqual({ kind: { kind: "none" }, durationSec: 0.5 });
  });

  it("디졸브·검은 화면·밀기·와이프·원형 열기·확대 효과의 시작과 끝 프레임을 계산한다", () => {
    expect(transitionStyleAt({ kind: "dissolve" }, 0, "start").opacity).toBe(0);
    expect(transitionStyleAt({ kind: "dissolve" }, 0.5, "start").opacity).toBe(0.5);
    expect(transitionStyleAt({ kind: "dissolve" }, 1, "end").opacity).toBe(0);
    expect(transitionStyleAt({ kind: "black-fade" }, 0, "start").opacity).toBe(0);
    expect(transitionStyleAt({ kind: "slide", direction: "left" }, 0, "start").transform).toContain("-100%");
    expect(transitionStyleAt({ kind: "slide", direction: "right" }, 0, "start").transform).toContain("100%");
    expect(transitionStyleAt({ kind: "wipe", direction: "up" }, 0.5, "start").clipPath).not.toBe(transitionStyleAt({ kind: "wipe", direction: "down" }, 0.5, "start").clipPath);
    expect(transitionStyleAt({ kind: "iris" }, 0, "start").clipPath).toContain("0%");
    expect(transitionStyleAt({ kind: "zoom" }, 0, "end").transform).toContain("scale(1)");
  });

  it("양쪽 경계 값이 디졸브면 더 긴 길이를 쓰고 총 길이를 유지한다", async () => {
    const raw = JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8"));
    const project = Project.parse(raw);
    const timeline = {
      ...project.timeline,
      video: project.timeline.video.map((clip) => clip.id === "video-opening"
        ? { ...clip, endTransition: { kind: { kind: "dissolve" as const }, durationSec: 0.5 } }
        : clip.id === "photo-insert"
          ? { ...clip, startTransition: { kind: { kind: "dissolve" as const }, durationSec: 0.4 } }
          : clip),
    };
    const render = timelineToRender(timeline);
    const boundary = render.transitions.find((item) => item.fromId === "video-opening" && item.toId === "photo-insert");
    expect(boundary).toMatchObject({ startFrame: 23, durationInFrames: 15, kind: { kind: "dissolve" } });
    expect(render.durationInFrames).toBe(138);
  });

  it("디졸브 구간에서 영상 1의 원본 오디오를 같은 길이로 교차한다", async () => {
    const raw = JSON.parse(await readFile(path.join(fixtureRoot, "project.json"), "utf8"));
    const project = Project.parse(raw);
    const timeline = {
      ...project.timeline,
      video: project.timeline.video.map((clip) => clip.id === "video-opening"
        ? { ...clip, endTransition: { kind: { kind: "dissolve" as const }, durationSec: 0.5 } }
        : clip.id === "photo-insert"
          ? { ...clip, startTransition: { kind: { kind: "dissolve" as const }, durationSec: 0.5 } }
          : clip),
    };
    const render = timelineToRender(timeline);
    expect(render.audio.find((item) => item.id === "video-opening-voice")?.volumeTransitions).toContainEqual({ startFrame: 23, durationInFrames: 15, from: 1, to: 0 });
    expect(render.audio.find((item) => item.id === "video-opening-bg")?.volumeTransitions).toContainEqual({ startFrame: 23, durationInFrames: 15, from: 1, to: 0 });
  });
});
