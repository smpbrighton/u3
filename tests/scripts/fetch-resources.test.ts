import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyLibrary } from "../../scripts/fetch-resources";

let root = "";
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function filePaths(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await filePaths(path.join(directory, entry.name), relative));
    else paths.push(relative);
  }
  return paths;
}

describe("fetch-resources library copy", () => {
  it("copies Unicode emotion libraries to ASCII paths and preserves sidecar emotions", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "u3-fetch-resources-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const proud = path.join(source, "memes", "뿌듯함".normalize("NFC"));
    const laugh = path.join(source, "sfx", "laugh");
    await Promise.all([mkdir(proud, { recursive: true }), mkdir(laugh, { recursive: true })]);
    await Promise.all([
      writeFile(path.join(proud, "a.mp4"), "clip"),
      writeFile(path.join(proud, "a.json"), JSON.stringify({ emotion: "뿌듯함" })),
      writeFile(path.join(laugh, "b.mp3"), "sound"),
      writeFile(path.join(laugh, "b.json"), JSON.stringify({ emotion: "웃음" })),
    ]);

    await copyLibrary(source, target);

    const sourceFiles = await filePaths(source);
    const copiedFiles = await filePaths(target);
    expect(copiedFiles.filter(value => !/^[\x00-\x7F]+$/.test(value))).toEqual([]);
    expect(copiedFiles).toHaveLength(sourceFiles.length);
    expect(JSON.parse(await readFile(path.join(target, "memes", "proud", "a.json"), "utf8")).emotion).toBe("뿌듯함");
    expect(JSON.parse(await readFile(path.join(target, "sfx", "laugh", "b.json"), "utf8")).emotion).toBe("웃음");
  });
});
