import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// compositor 바이너리는 서로를 맨 이름(libavutil.dylib)으로 참조한다. hardened runtime 은 상대 경로를 거부하므로
// 패키징 때 @loader_path/<이름> 으로 다시 써야 한다. 이 테스트는 그 스크립트와 패키징·서명 경로의 연결을 고정한다.
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/fix-dylib-paths.sh");
// 선택 의존성이라 최상위 node_modules 에 링크되지 않는다. pnpm 저장소에서 찾는다.
async function compositorDir(): Promise<string> {
  const store = path.join(root, "node_modules/.pnpm");
  const entry = (await readdir(store)).find(name => name.startsWith("@remotion+compositor-darwin-arm64@"));
  if (!entry) throw new Error("compositor-darwin-arm64 가 설치돼 있지 않다");
  return path.join(store, entry, "node_modules/@remotion/compositor-darwin-arm64");
}
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function dependencies(file: string): Promise<string[]> {
  const { stdout } = await exec("otool", ["-L", file]);
  return stdout.split(/\r?\n/).slice(1).map(line => line.trim().split(" ")[0]).filter(Boolean);
}

describe("compositor dylib 설치 이름", () => {
  it("맨 이름 참조를 @loader_path 로 바꾸고 ad-hoc 으로 다시 서명한다", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "u3-dylib-")); temporary.push(dir);
    const compositor = await compositorDir();
    for (const name of ["libavutil.dylib", "libavcodec.dylib", "libswresample.dylib"]) await copyFile(path.join(compositor, name), path.join(dir, name));
    const codec = path.join(dir, "libavcodec.dylib");
    expect((await dependencies(codec)).some(dep => !dep.startsWith("/") && !dep.startsWith("@"))).toBe(true);
    await expect(exec("bash", [script, "--check", dir])).rejects.toThrow();

    await exec("bash", [script, dir]);
    const after = await dependencies(codec);
    expect(after.filter(dep => !dep.startsWith("/") && !dep.startsWith("@"))).toEqual([]);
    expect(after).toContain("@loader_path/libavutil.dylib");
    const { stdout: id } = await exec("otool", ["-D", path.join(dir, "libavutil.dylib")]);
    expect(id.trim().split(/\r?\n/).at(-1)).toBe("@loader_path/libavutil.dylib");
    await expect(exec("codesign", ["--verify", codec])).resolves.toBeDefined();
    await expect(exec("bash", [script, "--check", dir])).resolves.toBeDefined();
  });

  it("패키징이 compositor 경로를 고치고 서명은 검사한 뒤 진행한다", async () => {
    const build = await readFile(path.join(root, "scripts/build-engine.ts"), "utf8");
    expect(build).toContain("scripts/fix-dylib-paths.sh");
    expect(build.indexOf("fix-dylib-paths.sh")).toBeLessThan(build.indexOf("checkDylibs(join(compositorDir"));
    const sign = await readFile(path.join(root, "scripts/sign-nested.sh"), "utf8");
    const check = sign.indexOf("fix-dylib-paths.sh\" --check");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(sign.indexOf("codesign --force"));
  });
});
