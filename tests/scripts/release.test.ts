import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/release.sh");
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

// 형식만 검사하는 dry-run용 가짜 서명이다. 개인키를 만들거나 사용하지 않는다.
function fixtureSignature(version: string) {
  const packet = Buffer.alloc(74); packet.write("ED");
  const text = `untrusted comment: dry-run fixture\n${packet.toString("base64")}\ntrusted comment: timestamp:0\tfile:U3.app.tar.gz\tversion:${version}\n${Buffer.alloc(64).toString("base64")}\n`;
  return Buffer.from(text).toString("base64");
}

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "u3-release-test-")); temporary.push(dir);
  const sig = path.join(dir, "fixture.sig"), out = path.join(dir, "out"), bin = path.join(dir, "bin");
  await mkdir(bin);
  for (const name of ["git", "pnpm", "security", "codesign", "xcrun", "hdiutil", "gh", "cargo", "ditto", "tar"]) {
    const stub = path.join(bin, name);
    await writeFile(stub, "#!/bin/sh\necho 'dry-run called a forbidden command' >&2\nexit 99\n"); await chmod(stub, 0o755);
  }
  const signature = fixtureSignature("0.2.1");
  await writeFile(sig, signature + "\n");
  const run = (version = "0.2.1", extra: string[] = []) => exec("bash", [script, version, "--dry-run", "--signature-file", sig, "--output-dir", out, ...extra], {
    cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { sig, out, signature, run };
}

describe.skipIf(process.platform !== "darwin")("릴리스 dry-run", () => {
  it("기본 dry-run은 Mac fragment만 만들고 공개 manifest를 만들지 않는다", async () => {
    const s = await setup();
    await s.run();
    expect(await readdir(s.out)).toEqual(["darwin.fragment.json"]);
    const fragment = JSON.parse(await readFile(path.join(s.out, "darwin.fragment.json"), "utf8"));
    expect(fragment).toMatchObject({ version: "0.2.1", platform: "darwin-aarch64", asset: "U3.app.tar.gz", signature: s.signature, dryRun: true });
    expect(await readFile(path.join(s.out, "latest.json"), "utf8").catch(() => null)).toBeNull();
  });
  it("버전·빌드·서명·공증·업로드를 건너뛰고 latest.json만 만든다", async () => {
    const s = await setup();
    const versionFiles = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
    const before = await Promise.all(versionFiles.map(file => readFile(path.join(root, file), "utf8")));
    await s.run("0.2.1", ["--mac-only"]);
    expect(await readdir(s.out)).toEqual(["latest.json"]);
    const latest = JSON.parse(await readFile(path.join(s.out, "latest.json"), "utf8"));
    expect(latest).toMatchObject({ version: "0.2.1", notes: "U3 0.2.1", platforms: { "darwin-aarch64": {
      url: "https://github.com/smpbrighton/u3/releases/download/v0.2.1/U3.app.tar.gz", signature: s.signature,
    } } });
    expect(Object.keys(latest.platforms)).toEqual(["darwin-aarch64"]);
    expect(latest.pub_date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(await Promise.all(versionFiles.map(file => readFile(path.join(root, file), "utf8")))).toEqual(before);
  });

  it.each(["", "invalid base64", Buffer.from("not minisign").toString("base64"), fixtureSignature("0.2.0")])("잘못되거나 버전이 다른 서명을 거절한다", async signature => {
    const s = await setup(); await writeFile(s.sig, signature);
    await expect(s.run()).rejects.toThrow();
    expect(await readFile(path.join(s.out, "latest.json"), "utf8").catch(() => null)).toBeNull();
  });

  it.each(["v0.2.1", "../0.2.1", "0.2", "01.2.1", "0.2.1;echo bad"])("잘못된 버전 %s를 거절한다", async version => {
    const s = await setup(); await expect(s.run(version)).rejects.toThrow();
  });

  it("X31 밖의 출력 경로를 거절한다", async () => {
    const s = await setup(); await expect(s.run("0.2.1", ["--output-dir", "/tmp/u3-release-outside"])).rejects.toThrow();
  });
});
