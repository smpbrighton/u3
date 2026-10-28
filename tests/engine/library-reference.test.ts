import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { libraryReferencePath, migrateLibraryReference } from "../../src/core/library-reference";
import { Store } from "../../src/engine/store";
import { asUrl } from "../../src/engine/pipeline/render";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("라이브러리 미디어 참조", () => {
  it("세션 A의 저장 URL을 세션 B의 라이브러리 경로와 URL로 푼다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "u3-library-ref-"));
    roots.push(root);
    const store = new Store(root);
    await store.init();
    const project = await store.createProject("library reference");
    const sessionAUrl = "http://127.0.0.1:41001/api/media/library/sfx/%ED%9A%A8%EA%B3%BC/test.wav?token=session-a";
    await store.saveProject({
      ...project,
      timeline: {
        ...project.timeline,
        sfx: [{ id: "sfx-1", startSec: 0, file: sessionAUrl, inStartSec: 0, inEndSec: 1, gain: 1 }],
      },
    });

    const loaded = await store.requireProject(project.id);
    const reference = loaded.timeline.sfx[0]!.file;
    const libraryRootB = path.resolve(root, "app/resources/library");
    const mediaUrlB = "http://127.0.0.1:52002/library/sfx/%ED%9A%A8%EA%B3%BC/test.wav?token=session-b";
    let resolvedPath = "";
    const resolvedUrl = asUrl(reference, path.join(root, "project"), (absolutePath) => {
      resolvedPath = absolutePath;
      return mediaUrlB;
    }, libraryRootB);

    expect(migrateLibraryReference(sessionAUrl)).toBe(reference);
    expect(libraryReferencePath(reference)).toBe("sfx/효과/test.wav");
    expect(resolvedPath).toBe(path.join(libraryRootB, "sfx/효과/test.wav"));
    expect(resolvedUrl).toBe(mediaUrlB);
  });
});
