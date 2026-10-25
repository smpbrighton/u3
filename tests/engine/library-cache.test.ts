import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invalidateMemeCache, listMemes } from "../../src/engine/pipeline/library";

let root = "";
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

async function writeMeme(id: string) {
  const folder = path.join(root, "library", "memes", "test");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, `${id}.mp4`), "clip");
  await writeFile(path.join(folder, `${id}.json`), JSON.stringify({
    id, emotion: "test", situations: [], importedAt: "2026-10-01T00:00:00.000Z", tagsConfirmed: true,
  }));
}

describe("meme library cache", () => {
  it("재호출은 사이드카를 다시 읽지 않고 명시적 무효화 뒤에 다시 읽는다", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-library-cache-"));
    await writeMeme("first");

    const first = await listMemes(root);
    const cached = await listMemes(root);
    expect(cached).toBe(first);

    await writeMeme("second");
    const changed = await listMemes(root);
    expect(changed.map((item) => item.id)).toEqual(["first", "second"]);

    await writeMeme("third");
    invalidateMemeCache(root);
    const refreshed = await listMemes(root);
    expect(refreshed.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
