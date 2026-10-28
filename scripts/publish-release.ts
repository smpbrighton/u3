import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Platform = "darwin-aarch64" | "windows-x86_64";
type Fragment = { version: string; commit: string; platform: Platform; asset: string; signature: string; assets: Record<string, string>; dryRun?: boolean };
const repository = "https://github.com/smpbrighton/u3";
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
function validateIdentity(version: string, commit: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("릴리스 버전·commit 오류");
}
function payloads(platform: Platform, version: string): string[] {
  if (platform === "darwin-aarch64") return ["U3.app.tar.gz", "U3.app.tar.gz.sig", `U3-${version}-arm64.dmg`];
  if (platform === "windows-x86_64") { const asset = `U3-${version}-windows-x64-setup.exe`; return [asset, asset + ".sig"]; }
  throw new Error("알 수 없는 릴리스 플랫폼입니다");
}
function decodeBase64(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("서명이 base64 형식이 아닙니다");
  return bytes;
}
function verifySignedVersion(signature: string, version: string): void {
  const lines = decodeBase64(signature).toString("utf8").trimEnd().split(/\r?\n/);
  if (lines.length !== 4 || !lines[0]!.startsWith("untrusted comment:") || !lines[2]!.startsWith("trusted comment:")) throw new Error("minisign 형식 오류");
  const packet = decodeBase64(lines[1]!);
  if (packet.length !== 74 || !["Ed", "ED"].includes(packet.subarray(0, 2).toString()) || decodeBase64(lines[3]!).length !== 64) throw new Error("minisign 서명 길이 오류");
  if (/\tversion:([^\t\r\n]+)/.exec(lines[2]!)?.[1] !== version) throw new Error("서명된 버전이 다릅니다");
}

export async function createFragment(options: { directory: string; platform: Platform; version: string; commit: string }): Promise<Fragment> {
  validateIdentity(options.version, options.commit);
  const names = payloads(options.platform, options.version), assets: Record<string, string> = {};
  for (const name of names) {
    const bytes = await readFile(join(options.directory, name));
    if (!bytes.length) throw new Error(`릴리스 자산이 비었습니다: ${name}`);
    assets[name] = hash(bytes);
  }
  const asset = names[0]!, signature = (await readFile(join(options.directory, asset + ".sig"), "utf8")).trim();
  verifySignedVersion(signature, options.version);
  return { version: options.version, commit: options.commit, platform: options.platform, asset, signature, assets };
}

export async function writeReleaseManifest(options: { directory: string; version: string; commit: string }): Promise<void> {
  validateIdentity(options.version, options.commit);
  const platforms: Record<string, { url: string; signature: string }> = {}, hashes: Record<string, string> = {};
  for (const [filename, platform] of [["darwin.fragment.json", "darwin-aarch64"], ["windows.fragment.json", "windows-x86_64"]] as const) {
    const fragment = JSON.parse(await readFile(join(options.directory, filename), "utf8")) as Fragment;
    if (fragment.dryRun || fragment.platform !== platform || fragment.version !== options.version || fragment.commit !== options.commit) throw new Error("fragment의 플랫폼·버전·commit이 태그와 다릅니다");
    const actual = await createFragment({ ...options, platform });
    if (fragment.asset !== actual.asset || fragment.signature !== actual.signature ||
        JSON.stringify(Object.keys(fragment.assets).sort()) !== JSON.stringify(Object.keys(actual.assets).sort())) throw new Error("fragment의 자산 목록·서명이 다릅니다");
    for (const [name, sha] of Object.entries(actual.assets)) {
      if (fragment.assets[name] !== sha) throw new Error(`릴리스 자산 SHA-256 오류: ${name}`);
      hashes[name] = sha;
    }
    platforms[platform] = { url: `${repository}/releases/download/v${options.version}/${actual.asset}`, signature: actual.signature };
  }
  const latest = JSON.stringify({ version: options.version, notes: `U3 ${options.version}`, pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), platforms }, null, 2) + "\n";
  hashes["latest.json"] = hash(latest);
  const sums = Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)).map(([name, sha]) => `${sha}  ${name}`).join("\n") + "\n";
  await writeFile(join(options.directory, "latest.json.part"), latest);
  await writeFile(join(options.directory, "SHA256SUMS.txt.part"), sums);
  await rename(join(options.directory, "latest.json.part"), join(options.directory, "latest.json"));
  await rename(join(options.directory, "SHA256SUMS.txt.part"), join(options.directory, "SHA256SUMS.txt"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "publish" && args.length === 3) {
    const [version, commit, directory] = args as [string, string, string];
    await writeReleaseManifest({ version, commit, directory });
  } else if (command === "fragment" && args.length === 4) {
    const [platform, version, commit, directory] = args as [Platform, string, string, string];
    const fragment = await createFragment({ platform, version, commit, directory });
    await writeFile(join(directory, platform === "darwin-aarch64" ? "darwin.fragment.json" : "windows.fragment.json"), JSON.stringify(fragment, null, 2) + "\n");
  } else throw new Error("사용법: publish-release.ts publish <버전> <commit> <폴더> | fragment <플랫폼> <버전> <commit> <폴더>");
}
