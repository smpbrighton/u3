import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const checker = path.join(root, "scripts/check-engine-key.sh");
const temporary: string[] = [];
const fixtureKey = "fixture-release-key-4f8e2b71";
afterEach(async () => { await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

async function setup(contents = "const key = process.env.TYPESAFE_API_KEY;", dotenv?: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "u3-engine-key-"));
  temporary.push(dir);
  const engine = path.join(dir, "engine.mjs"), envFile = path.join(dir, ".env");
  await writeFile(engine, contents);
  if (dotenv !== undefined) await writeFile(envFile, dotenv);
  const env = { ...process.env, TYPESAFE_API_KEY: "", U3_ENV_FILE: envFile };
  const run = (target = engine, overrides: NodeJS.ProcessEnv = {}) => exec("bash", [checker, target], { env: { ...env, ...overrides } });
  return { dir, engine, envFile, env, run };
}

describe("배포 엔진 키 검사", () => {
  it("키 파일 없이 런타임 환경 변수 읽기를 허용한다", async () => {
    const { run } = await setup();
    expect((await run()).stdout).toContain("✓ engine key check passed");
  });

  it.each([
    'process.env.TYPESAFE_API_KEY = "fixture";',
    'process.env.TYPESAFE_API_KEY="fixture";',
    'process.env["TYPESAFE_API_KEY"] = "fixture";',
    "process.env['TYPESAFE_API_KEY']??='fixture';",
    'const TYPESAFE_API_KEY = "fixture";',
  ])("키 대입 구문 %#을 거절한다", async contents => {
    const { run } = await setup(contents);
    await expect(run()).rejects.toThrow();
  });

  it.each([
    `TYPESAFE_API_KEY=${fixtureKey}`,
    `export TYPESAFE_API_KEY="${fixtureKey}"`,
    `TYPESAFE_API_KEY='${fixtureKey}'`,
    `TYPESAFE_API_KEY=${fixtureKey} # comment`,
  ])("dotenv 키 값 %#을 값·대입 이름 출력 없이 거절한다", async dotenv => {
    const { run } = await setup(`const hidden = "${fixtureKey}";`, dotenv);
    const result = await run().then(() => null, error => error as { code: number; stdout: string; stderr: string });
    expect(result?.code).not.toBe(0);
    expect(result).not.toBeNull();
    expect(`${result?.stdout}${result?.stderr}`).not.toContain(fixtureKey);
  });

  it("프로세스 환경의 키와 이스케이프된 키 리터럴도 거절한다", async () => {
    const key = 'fixture-"quoted"-key';
    const { run } = await setup(`const hidden = ${JSON.stringify(key)};`);
    const result = await run(undefined, { TYPESAFE_API_KEY: key }).then(() => null, error => error as { code: number; stdout: string; stderr: string });
    expect(result).not.toBeNull();
    expect(`${result?.stdout}${result?.stderr}`).not.toContain(key);
  });

  it("빈 환경 키와 비교 구문은 허용한다", async () => {
    const { run } = await setup('const empty = process.env.TYPESAFE_API_KEY === "";', 'TYPESAFE_API_KEY=""');
    await expect(run()).resolves.toBeDefined();
  });

  it("완성된 앱 안의 모든 엔진을 검사하고 엔진이 없으면 실패한다", async () => {
    const { run, dir } = await setup();
    const app = path.join(dir, "U3.app"), resources = path.join(app, "Contents/Resources/resources");
    await mkdir(resources, { recursive: true });
    await expect(run(app)).rejects.toThrow();
    await writeFile(path.join(resources, "engine.mjs"), "// clean engine");
    await expect(run(app)).resolves.toBeDefined();
    const nested = path.join(resources, "other"); await mkdir(nested);
    await writeFile(path.join(nested, "engine.mjs"), 'process.env.TYPESAFE_API_KEY = "fixture"');
    await expect(run(app)).rejects.toThrow();
  });

  it("엔진 파일이 없으면 실패한다", async () => {
    const { run, dir } = await setup();
    await expect(run(path.join(dir, "missing.mjs"))).rejects.toThrow();
  });
});

async function packageFixture(stage: "clean" | "source" | "app") {
  const { dir, env } = await setup();
  const scripts = path.join(dir, "scripts"), bin = path.join(dir, "bin"), target = path.join(dir, "target");
  await mkdir(scripts); await mkdir(bin);
  for (const name of ["package.sh", "check-engine-key.sh", "check-engine-key.mjs"]) await cp(path.join(root, "scripts", name), path.join(scripts, name));
  const pnpm = path.join(bin, "pnpm");
  await writeFile(pnpm, `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2), root = process.cwd();
fs.appendFileSync(path.join(root, "commands"), args.join(" ") + "\\n");
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
if (args.includes("scripts/build-engine.ts")) write(path.join(root, "src-tauri/resources/engine.mjs"), ${JSON.stringify(stage === "source" ? 'process.env.TYPESAFE_API_KEY="fixture"' : "// clean engine")});
if (args.includes("tauri")) write(path.join(process.env.CARGO_TARGET_DIR, "release/bundle/macos/U3.app/Contents/Resources/resources/engine.mjs"), ${JSON.stringify(stage === "app" ? 'process.env.TYPESAFE_API_KEY="fixture"' : "// clean packaged engine")});
`);
  await chmod(pnpm, 0o755);
  await writeFile(path.join(scripts, "build-whisper.sh"), "#!/bin/sh\nexit 0\n");
  await writeFile(path.join(scripts, "build-tts.sh"), "#!/bin/sh\nprintf 'build-tts\\n' >> commands\n");
  const run = () => exec("bash", [path.join(scripts, "package.sh"), "--config", "release.json", "--bundles", "app", "--no-sign"], {
    cwd: dir, env: { ...env, CARGO_TARGET_DIR: target, PATH: `${bin}:${process.env.PATH}` },
  });
  return { run, dir };
}

describe("패키징 키 검사 연결", () => {
  it("키가 든 원본 엔진이면 Tauri 빌드 전에 멈춘다", async () => {
    const { run, dir } = await packageFixture("source");
    await expect(run()).rejects.toThrow();
    expect(await readFile(path.join(dir, "commands"), "utf8")).not.toContain("tauri build");
  });

  it("Tauri가 만든 앱에 키가 있으면 패키징을 실패시킨다", async () => {
    const { run } = await packageFixture("app");
    await expect(run()).rejects.toThrow();
  });

  it("검사를 통과한 앱만 성공하고 릴리스 빌드 인자를 유지한다", async () => {
    const { run, dir } = await packageFixture("clean");
    await expect(run()).resolves.toBeDefined();
    const commands = await readFile(path.join(dir, "commands"), "utf8");
    expect(commands).toContain("--config release.json --bundles app --no-sign");
    expect(commands.indexOf("build-tts")).toBeGreaterThan(commands.indexOf("scripts/build-engine.ts"));
    expect(commands.indexOf("build-tts")).toBeLessThan(commands.indexOf("scripts/fetch-resources.ts"));
    expect(commands.indexOf("scripts/fetch-resources.ts")).toBeLessThan(commands.indexOf("tauri build"));
  });

  it("릴리스가 앱의 키 검사를 서명·공증보다 먼저 실행한다", async () => {
    const release = await readFile(path.join(root, "scripts/release.sh"), "utf8");
    const check = release.indexOf('bash scripts/check-engine-key.sh "$APP"');
    expect(check).toBeGreaterThan(release.indexOf("pnpm package --config"));
    expect(check).toBeLessThan(release.indexOf('bash scripts/sign-nested.sh "$APP"'));
  });
});
