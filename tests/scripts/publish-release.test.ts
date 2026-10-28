import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeReleaseManifest } from "../../scripts/publish-release";
const version = "0.4.0", commit = "a".repeat(40), roots: string[] = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
function signature(signedVersion = version) {
  const packet = Buffer.alloc(74); packet.write("ED");
  return Buffer.from(`untrusted comment: fixture\n${packet.toString("base64")}\ntrusted comment: timestamp:0\tversion:${signedVersion}\n${Buffer.alloc(64).toString("base64")}\n`).toString("base64");
}
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "u3-publish-")); roots.push(directory);
  const mac = "U3.app.tar.gz", win = `U3-${version}-windows-x64-setup.exe`, dmg = `U3-${version}-arm64.dmg`, sig = signature();
  const files = { [mac]: "Mac payload", [mac + ".sig"]: sig, [dmg]: "DMG", [win]: "Windows payload", [win + ".sig"]: sig };
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(directory, name), value);
  const fragment = (platform: string, asset: string, names: string[]) => ({ version, commit, platform, asset, signature: sig, assets: Object.fromEntries(names.map(name => [name, hash(files[name as keyof typeof files]!)])) });
  const darwin = fragment("darwin-aarch64", mac, [mac, mac + ".sig", dmg]), windows = fragment("windows-x86_64", win, [win, win + ".sig"]);
  const save = async () => { await writeFile(path.join(directory, "darwin.fragment.json"), JSON.stringify(darwin)); await writeFile(path.join(directory, "windows.fragment.json"), JSON.stringify(windows)); };
  await save();
  return { directory, darwin, windows, save, win, run: () => writeReleaseManifest({ directory, version, commit }) };
}
it("동일 버전·commit·hash의 두 플랫폼만 하나의 manifest로 합친다", async () => {
  const x = await setup(); await x.run();
  const latest = JSON.parse(await readFile(path.join(x.directory, "latest.json"), "utf8"));
  expect(Object.keys(latest.platforms).sort()).toEqual(["darwin-aarch64", "windows-x86_64"]);
  expect(latest.platforms["windows-x86_64"]).toEqual({ url: `https://github.com/smpbrighton/u3/releases/download/v${version}/${x.win}`, signature: signature() });
  expect(await readFile(path.join(x.directory, "SHA256SUMS.txt"), "utf8")).toContain(`${hash("Mac payload")}  U3.app.tar.gz`);
});
it.each(["version", "commit", "missing", "tamper", "signed-version", "dry-run"])("%s 오류에서는 latest를 쓰지 않는다", async mode => {
  const x = await setup();
  if (mode === "version") x.windows.version = "0.4.1";
  if (mode === "commit") x.windows.commit = "b".repeat(40);
  if (mode === "signed-version") {
    x.windows.signature = signature("0.3.9");
    await writeFile(path.join(x.directory, x.win + ".sig"), x.windows.signature);
    x.windows.assets[x.win + ".sig"] = hash(x.windows.signature);
  }
  if (mode === "dry-run") Object.assign(x.windows, { dryRun: true });
  await x.save();
  if (mode === "missing") await rm(path.join(x.directory, "windows.fragment.json"));
  if (mode === "tamper") await writeFile(path.join(x.directory, x.win), "tampered");
  await expect(x.run()).rejects.toThrow();
  expect(await readFile(path.join(x.directory, "latest.json"), "utf8").catch(() => null)).toBeNull();
});
