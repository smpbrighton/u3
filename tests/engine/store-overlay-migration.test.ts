import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../../src/engine/store";

describe("Store overlay migration", () => {
  it("overlay 없는 기존 project.json을 빈 겹친 영상 배열로 읽는다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-overlay-migration-"));
    const id = "20261024-000000-abcd";
    try {
      const projectDir = path.join(root, "projects", id);
      await mkdir(projectDir, { recursive: true });
      const oldProject = JSON.parse(await readFile("tests/fixtures/project/project.json", "utf8")) as Record<string, unknown>;
      oldProject.id = id;
      const timeline = oldProject.timeline as Record<string, unknown>;
      delete timeline.overlay;
      await writeFile(path.join(projectDir, "project.json"), JSON.stringify(oldProject));
      const project = await new Store(root).getProject(id);
      expect(project?.timeline.overlay).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
