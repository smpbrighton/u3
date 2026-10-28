import { buildPlatform, npmCliCandidates } from "./build-platforms";
import { cp, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { bundle } from "@remotion/bundler";
import { ensureBrowser } from "@remotion/renderer";

const root = resolve(import.meta.dirname, "..");
const resources = join(root, "src-tauri/resources");
const cache = process.env.U3_BUILD_CACHE ?? join(homedir(), "Library/Caches/u3-build");
const nodeVersion = "v24.13.0";
const descriptor = buildPlatform(process.platform, process.arch);
const nodeArchive = descriptor.nodeArchive;
const nodeUrl = `https://nodejs.org/dist/${nodeVersion}/${nodeArchive}`;
const temporary = await mkdtemp(join(tmpdir(), "u3-engine-build-"));

function fail(message: string): never {
  throw new Error(message);
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  const data = await readFile(file);
  hash.update(data);
  return hash.digest("hex");
}

async function installNodeRuntime(): Promise<string> {
  const nodeCache = join(cache, `node-${nodeVersion}-${process.platform === "win32" ? "win-x64" : "darwin-arm64"}`);
  const nodeBinary = join(nodeCache, descriptor.nodeBinary);
  try {
    await readFile(nodeBinary);
    return nodeBinary;
  } catch {
    // Download into the external build cache.
  }
  await mkdir(nodeCache, { recursive: true });
  const archive = join(temporary, nodeArchive);
  const sums = join(temporary, "SHASUMS256.txt");
  execFileSync("curl", ["-fL", nodeUrl, "-o", archive], { stdio: "inherit" });
  execFileSync("curl", ["-fL", `https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`, "-o", sums], { stdio: "inherit" });
  const expected = (await readFile(sums, "utf8")).split(/\r?\n/)
    .map(line => line.match(/^([a-f0-9]{64})\s+\*?(.+)$/))
    .find(match => match?.[2] === nodeArchive)?.[1];
  if (!expected) fail("Node SHASUMS256.txt에 배포 파일 해시가 없습니다.");
  if (await sha256(archive) !== expected) fail("Node 공식 배포본 SHA-256 검사가 실패했습니다.");
  execFileSync("tar", ["-xf", archive, "--strip-components=1", "-C", nodeCache]);
  return nodeBinary;
}

async function installProductionDependencies(stage: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  const runtimePackages = [
    "@hono/node-server", "@huggingface/transformers", "@remotion/fonts", "@remotion/media", "@remotion/renderer",
    "fft.js", "hono", "onnxruntime-node", "opentype.js", "p-queue", "react", "react-dom", "remotion", "wav", "zod",
  ];
  const dependencies = Object.fromEntries(runtimePackages.map(name => {
    const version = manifest.dependencies[name];
    if (!version) fail(`런타임 의존성이 package.json에 없습니다: ${name}`);
    return [name, version];
  }));
  const stagePackage = {
    name: "u3-engine-runtime",
    private: true,
    type: "module",
    dependencies,
    // The app and Transformers must load one native ONNX runtime Env per process.
    overrides: { "onnxruntime-node": dependencies["onnxruntime-node"] },
  };
  await writeFile(join(stage, "package.json"), `${JSON.stringify(stagePackage, null, 2)}\n`);
  const npmCliJs = npmCliCandidates(realpathSync(process.execPath)).find(file => existsSync(file));
  if (!npmCliJs) fail("npm CLI JS 진입점을 찾지 못했습니다");
  execFileSync(process.execPath, [npmCliJs, "install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: stage,
    env: { ...process.env, npm_config_cache: join(cache, "npm") },
    stdio: "inherit",
    windowsHide: true,
  });
}

async function checkDylibs(binary: string, bundledDir?: string): Promise<void> {
  const output = execFileSync("otool", ["-L", binary], { encoding: "utf8" });
  const unexpected = output.split(/\r?\n/).slice(1).filter(line => {
    const dependency = line.trim().split(" ")[0];
    if (!dependency || dependency.startsWith("/System/Library/") || dependency.startsWith("/usr/lib/")) return false;
    // 맨 이름(경로 없음)은 hardened runtime 이 거부한다. fix-dylib-paths.sh 가 @loader_path 로 바꾼 뒤여야 한다.
    if (!dependency.startsWith("/") && !dependency.startsWith("@")) return true;
    if (bundledDir && dependency.startsWith("@")) return !existsSync(join(bundledDir, basename(dependency)));
    return true;
  });
  if (unexpected.length) fail(`앱 외부 dylib 의존성이 있습니다: ${unexpected.map(line => line.trim().split(" ")[0]).join(", ")}`);
}

try {
  await mkdir(cache, { recursive: true });
  await rm(resources, { recursive: true, force: true });
  await mkdir(resources, { recursive: true });
  const nodeBinary = await installNodeRuntime();
  const runtimeStage = join(temporary, "runtime");
  await mkdir(runtimeStage, { recursive: true });
  await installProductionDependencies(runtimeStage);

  const runtimeNodeModules = join(runtimeStage, "node_modules");
  const bundlePath = join(resources, "engine.mjs");
  await build({
    entryPoints: [join(root, "src/engine/main.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    packages: "external",
    absWorkingDir: root,
    nodePaths: [runtimeNodeModules],
    sourcemap: false,
    logLevel: "silent",
  });
  execFileSync("bash", [join(root, "scripts/check-engine-key.sh"), bundlePath], { stdio: "inherit" });
  await cp(nodeBinary, join(resources, "node" + descriptor.extension));
  await chmod(join(resources, "node" + descriptor.extension), 0o755);
  // compositor 의 맨 이름 dylib 참조를 @loader_path 로 고친다(hardened runtime 이 상대 경로를 거부한다).
  if (process.platform === "darwin") {
    execFileSync("bash", [join(root, "scripts/fix-dylib-paths.sh"), join(runtimeNodeModules, descriptor.compositor)], { stdio: "inherit" });
  }
  await cp(runtimeNodeModules, join(resources, "node_modules"), { recursive: true });
  await rm(join(resources, "node_modules/.bin"), { recursive: true, force: true });

  await bundle({ entryPoint: join(root, "src/remotion/index.ts"), outDir: join(resources, "remotion-bundle") });
  const browser = await ensureBrowser({ logLevel: "info" });
  if (browser.type !== "local-puppeteer-browser") fail(`Remotion Chrome 유형이 예상과 다릅니다: ${browser.type}`);
  await cp(dirname(browser.path), join(resources, "chrome"), { recursive: true });
  await writeFile(join(resources, "chrome-path.txt"), basename(browser.path));

  if (process.platform === "darwin") {
  await checkDylibs(join(resources, "node" + descriptor.extension));
  const compositorDir = join(runtimeNodeModules, descriptor.compositor);
  for (const executable of ["remotion", "ffmpeg", "ffprobe"]) {
    await checkDylibs(join(compositorDir, executable), compositorDir);
  }
  for (const name of ["libavcodec.dylib", "libavdevice.dylib", "libavfilter.dylib", "libavformat.dylib", "libavutil.dylib", "libswresample.dylib", "libswscale.dylib"]) {
    await checkDylibs(join(compositorDir, name), compositorDir);
  }
  const onnxDir = join(runtimeNodeModules, "onnxruntime-node/bin/napi-v6", descriptor.onnx);
  await checkDylibs(join(onnxDir, "onnxruntime_binding.node"), onnxDir);
  await checkDylibs(join(onnxDir, "libonnxruntime.1.22.0.dylib"), onnxDir);
  } else {
    await mkdir(join(resources, "bin"), { recursive: true });
    const helperTarget = join(cache, "key-store-target");
    execFileSync("cargo", ["build", "--release", "--manifest-path", join(root, "native/u3-key-store/Cargo.toml"), "--target-dir", helperTarget], { stdio: "inherit", windowsHide: true });
    await cp(join(helperTarget, "release/u3-key-store.exe"), join(resources, "bin/u3-key-store.exe"));
    checkWindowsDeps();
  }
  process.stdout.write("엔진 리소스를 준비하고 플랫폼 의존성 검사를 통과했습니다.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function checkWindowsDeps(): void {
  const options = { cwd: resources, stdio: "inherit" as const, windowsHide: true };
  execFileSync(join(resources, "node.exe"), ["-e", "require('onnxruntime-node')"], options);
  for (const file of ["ffmpeg.exe", "ffprobe.exe"]) {
    execFileSync(join(resources, "node_modules", descriptor.compositor, file), ["-version"], options);
  }
}
