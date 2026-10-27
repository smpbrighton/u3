import { afterEach, describe, expect, it } from "vitest";
import { copyFile, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function appFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "u3-macos-executables-")); directories.push(dir);
  const app = path.join(dir, "U3.app"), macos = path.join(app, "Contents/MacOS"), bin = path.join(dir, "bin"), calls = path.join(dir, "codesign-called");
  await mkdir(macos, { recursive: true }); await mkdir(bin);
  await copyFile("/usr/bin/true", path.join(macos, "u3"));
  const stub = path.join(bin, "codesign");
  await writeFile(stub, '#!/bin/sh\ntouch "$U3_TEST_SIGN_CALLS"\nexit 99\n'); await chmod(stub, 0o755);
  const run = (script: string) => exec("bash", [path.join(root, "scripts", script), app, "test identity"], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, U3_TEST_SIGN_CALLS: calls },
  });
  return { app, macos, calls, run };
}

describe("macOS 실행 파일 서명 검사", () => {
  it("Contents/MacOS의 Mach-O 파일만 통과시킨다", async () => {
    const s = await appFixture();
    await expect(s.run("check-macos-executables.sh")).resolves.toBeDefined();
    await writeFile(path.join(s.macos, "u3-engine"), "#!/bin/sh\nexec node engine.mjs\n");
    await expect(s.run("check-macos-executables.sh")).rejects.toThrow("Mach-O");
  });

  it("sign-nested는 셸 파일이 있으면 codesign 전에 거절한다", async () => {
    const s = await appFixture();
    await writeFile(path.join(s.macos, "u3-engine"), "#!/bin/sh\nexit 0\n");
    await expect(s.run("sign-nested.sh")).rejects.toThrow("Mach-O");
    expect(await readFile(s.calls, "utf8").catch(() => null)).toBeNull();
  });

  it("패키징 설정과 빌드 스크립트가 u3-engine 셸 런처를 포함하지 않는다", async () => {
    const conf = JSON.parse(await readFile(path.join(root, "src-tauri/tauri.bundle.conf.json"), "utf8"));
    expect(conf.bundle.externalBin).not.toContain("binaries/u3-engine");
    const build = await readFile(path.join(root, "scripts/build-engine.ts"), "utf8");
    expect(build).not.toContain("binaries/u3-engine-aarch64-apple-darwin");
  });

  it("실제 릴리스도 중첩 서명 전에 같은 검사를 실행한다", async () => {
    const release = await readFile(path.join(root, "scripts/release.sh"), "utf8");
    const guard = release.indexOf('bash scripts/check-macos-executables.sh "$APP"');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(release.indexOf('bash scripts/sign-nested.sh "$APP"'));
  });
});
