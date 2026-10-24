import { cp, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
const nodeArchive = `node-${nodeVersion}-darwin-arm64.tar.gz`;
const nodeUrl = `https://nodejs.org/dist/${nodeVersion}/${nodeArchive}`;
const temporary = await mkdtemp(join(tmpdir(), "u3-engine-build-"));

function fail(message: string): never {
  throw new Error(message);
}

function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[match[1]] = value;
  }
  return values;
}

async function readJevKey(): Promise<string> {
  const dotenvPath = join(root, ".env");
  const selectedPath = process.env.U3_ENV_FILE || dotenvPath;
  let contents: string;
  try {
    contents = await readFile(selectedPath, "utf8");
  } catch {
    fail("Jev 키 파일을 읽지 못했습니다. 레포 루트 .env 또는 U3_ENV_FILE을 확인하세요.");
  }
  const key = parseEnv(contents).TYPESAFE_API_KEY;
  if (!key?.trim()) fail("TYPESAFE_API_KEY가 비어 있습니다.");
  return key.trim();
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  const data = await readFile(file);
  hash.update(data);
  return hash.digest("hex");
}

async function installNodeRuntime(): Promise<string> {
  const nodeCache = join(cache, `node-${nodeVersion}-darwin-arm64`);
  const nodeBinary = join(nodeCache, "bin/node");
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
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", nodeCache]);
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
  };
  await writeFile(join(stage, "package.json"), `${JSON.stringify(stagePackage, null, 2)}\n`);
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: stage,
    stdio: "inherit",
  });
}

async function checkDylibs(binary: string, bundledDir?: string): Promise<void> {
  const output = execFileSync("otool", ["-L", binary], { encoding: "utf8" });
  const unexpected = output.split(/\r?\n/).slice(1).filter(line => {
    const dependency = line.trim().split(" ")[0];
    if (!dependency || dependency.startsWith("/System/Library/") || dependency.startsWith("/usr/lib/")) return false;
    if (bundledDir && !dependency.startsWith("/")) return !existsSync(join(bundledDir, basename(dependency)));
    return true;
  });
  if (unexpected.length) fail(`앱 외부 dylib 의존성이 있습니다: ${unexpected.map(line => line.trim().split(" ")[0]).join(", ")}`);
}

try {
  const jevKey = await readJevKey();
  await mkdir(cache, { recursive: true });
  await rm(resources, { recursive: true, force: true });
  await mkdir(resources, { recursive: true });
  const nodeBinary = await installNodeRuntime();
  const runtimeStage = join(temporary, "runtime");
  await mkdir(runtimeStage, { recursive: true });
  await installProductionDependencies(runtimeStage);

  const engineSource = await readFile(join(root, "src/engine/main.ts"), "utf8");
  const runtimeNodeModules = join(runtimeStage, "node_modules");
  const bundlePath = join(resources, "engine.mjs");
  await build({
    stdin: {
      contents: `process.env.TYPESAFE_API_KEY = ${JSON.stringify(jevKey)};\n${engineSource}`,
      resolveDir: join(root, "src/engine"),
      sourcefile: "main.ts",
      loader: "ts",
    },
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
  await cp(nodeBinary, join(resources, "node"));
  await chmod(join(resources, "node"), 0o755);
  await cp(runtimeNodeModules, join(resources, "node_modules"), { recursive: true });
  await rm(join(resources, "node_modules/.bin"), { recursive: true, force: true });

  await bundle({ entryPoint: join(root, "src/remotion/index.ts"), outDir: join(resources, "remotion-bundle") });
  const browser = await ensureBrowser({ logLevel: "info" });
  if (browser.type !== "local-puppeteer-browser") fail(`Remotion Chrome 유형이 예상과 다릅니다: ${browser.type}`);
  await cp(dirname(browser.path), join(resources, "chrome-headless-shell"), { recursive: true });
  await writeFile(join(resources, "chrome-path.txt"), basename(browser.path));

  const launcher = join(root, "src-tauri/binaries/u3-engine-aarch64-apple-darwin");
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(launcher, `#!/bin/sh\nset -eu\nAPP_RESOURCES="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources/resources" && pwd)"\nexec "$APP_RESOURCES/node" "$APP_RESOURCES/engine.mjs"\n`);
  await chmod(launcher, 0o755);

  await checkDylibs(join(resources, "node"));
  const compositorDir = join(runtimeNodeModules, "@remotion/compositor-darwin-arm64");
  for (const executable of ["remotion", "ffmpeg", "ffprobe"]) {
    await checkDylibs(join(compositorDir, executable), compositorDir);
  }
  for (const name of ["libavcodec.dylib", "libavdevice.dylib", "libavfilter.dylib", "libavformat.dylib", "libavutil.dylib", "libswresample.dylib", "libswscale.dylib"]) {
    await checkDylibs(join(compositorDir, name), compositorDir);
  }
  const onnxDir = join(runtimeNodeModules, "onnxruntime-node/bin/napi-v6/darwin/arm64");
  await checkDylibs(join(onnxDir, "onnxruntime_binding.node"), onnxDir);
  await checkDylibs(join(onnxDir, "libonnxruntime.1.22.0.dylib"), onnxDir);
  process.stdout.write("엔진 리소스를 준비했습니다. Node와 compositor dylib 검사를 통과했습니다.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
