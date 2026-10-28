import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fetchResources, resourceFiles, validateResourceManifest } from "./fetch-resources";

const version = process.argv[2];
if (process.platform !== "darwin" || !version || !/^[1-9]\d*$/.test(version)) throw new Error("사용법: tsx scripts/make-resource-archive.ts <리소스 정수 버전> [출력 폴더]. Mac에서 실행하세요");
const output = resolve(process.argv[3] ?? process.env.U3_BUILD_CACHE ?? "out");
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(tmpdir(), "u3-resources-"));
try {
  await fetchResources(stage, true);
  await rename(join(stage, "library/meme-embed"), join(stage, "meme-embed"));
  await rm(join(stage, "assets"), { recursive: true, force: true });
  const files: Record<string, string> = {};
  for (const name of await resourceFiles(stage)) files[name] = createHash("sha256").update(await readFile(join(stage, name))).digest("hex");
  await writeFile(join(stage, "manifest.json"), JSON.stringify({ version, files }, null, 2) + "\n");
  await validateResourceManifest(stage);
  const archive = join(output, `u3-resources-${version}.tar.gz`);
  execFileSync("tar", ["--no-xattrs", "--no-acls", "--no-fflags", "-czf", archive, "-C", stage, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" }, stdio: "inherit" });
  const checksum = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(archive + ".sha256", `${checksum}  u3-resources-${version}.tar.gz\n`);
  process.stdout.write(`${checksum}  ${archive}\n`);
} finally { await rm(stage, { recursive: true, force: true }); }
