import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listMemes } from "../../src/engine/pipeline/library";

let root = "";
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("library memes", () => {
  it("uses sidecar emotion when the resource folder has an ASCII slug", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-library-memes-"));
    const folder = path.join(root, "library", "memes", "proud");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "meme-1.mp4"), "clip");
    await writeFile(path.join(folder, "meme-1.json"), JSON.stringify({
      id: "meme-1",
      emotion: "뿌듯함",
      situations: [],
      importedAt: "2026-09-01T00:00:00.000Z",
      tagsConfirmed: true,
    }));

    const memes = await listMemes(root);

    expect(memes).toHaveLength(1);
    expect(memes[0]?.emotion).toBe("뿌듯함");
    expect(memes[0]?.category).toBe("뿌듯함");
    expect(memes[0]?.file).toBe(path.join(folder, "meme-1.mp4"));
  });
});
