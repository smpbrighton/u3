import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const resources = path.resolve(import.meta.dirname, "../../src-tauri/resources");

async function resourcePaths(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    paths.push(relative);
    if (entry.isDirectory()) paths.push(...await resourcePaths(path.join(directory, entry.name), relative));
  }
  return paths;
}

describe("packaged resource names", () => {
  it("uses ASCII names for every path copied by fetch-resources", async () => {
    const paths = await resourcePaths(path.join(resources, "library"));

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter(value => !/^[\x00-\x7F]+$/.test(value))).toEqual([]);
  });
});
