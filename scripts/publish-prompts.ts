import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { BUNDLED_PROMPT_DEFAULTS, PROMPT_SCHEMA, PromptDefaultsFile, type PromptDefaults } from "../src/core/default-prompts";

// revision 1 파일에는 말투·성격이 없다. 읽기만 허용하고 본문 비교에서 다른 것으로 본다.
const RemotePromptFile = PromptDefaultsFile.partial({ tone: true, persona: true });
type RemotePrompts = z.infer<typeof RemotePromptFile>;
export function parseRemote(value: unknown): RemotePrompts {
  return RemotePromptFile.parse(value);
}

export function decidePublish(remote: RemotePrompts | null, local: PromptDefaults): "unchanged" | "publish" {
  if (!remote) return "publish";
  const sameText = remote.script === local.script && remote.tone === local.tone && remote.persona === local.persona && remote.carouselTopic === local.carouselTopic && remote.carouselVideo === local.carouselVideo;
  if (remote.revision === local.revision && sameText) return "unchanged";
  if (remote.revision >= local.revision && !sameText) throw new Error("기본 프롬프트를 바꿨으면 PROMPT_REVISION 을 올리세요");
  return "publish";
}

// curl -f 의 HTTP 오류 종료 코드는 버전에 따라 22 또는 56 이다. --write-out 의 HTTP 코드로 판정한다.
export function isMissingRemote(failure: { status?: number | null; stdout?: string }): boolean {
  return failure.stdout?.trim() === "404";
}

const root = path.resolve(import.meta.dirname, "..");
const repo = "smpbrighton/u3";
function command(bin: string, args: string[]): string {
  return execFileSync(bin, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readRemote(url: string): RemotePrompts | null {
  let text: string;
  try {
    text = command("curl", ["-fsSL", "--max-time", "30", "--max-filesize", String(512 * 1024), "--write-out", "\n%{http_code}", url]);
  } catch (error) {
    if (isMissingRemote(error as { status?: number; stdout?: string })) return null;
    throw error;
  }
  return parseRemote(JSON.parse(text.slice(0, text.lastIndexOf("\n"))));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run") || args.length > 1) throw new Error("사용법: scripts/publish-prompts.sh [--dry-run]");
  const dryRun = args.includes("--dry-run");
  if (command("git", ["branch", "--show-current"]).trim() !== "main") throw new Error("기본 프롬프트 공개는 main에서 실행하세요");
  if (command("git", ["status", "--porcelain"]).trim()) throw new Error("변경·미추적 파일을 먼저 정리하세요");
  if (!["https://github.com/smpbrighton/u3", "https://github.com/smpbrighton/u3.git", "git@github.com:smpbrighton/u3.git"].includes(command("git", ["remote", "get-url", "origin"]).trim())) {
    throw new Error("origin이 smpbrighton/u3가 아닙니다");
  }
  const tmpDir = process.env.TMPDIR;
  if (!tmpDir || !path.resolve(tmpDir).startsWith("/Volumes/X31/")) throw new Error("TMPDIR은 X31 안에 있어야 합니다");
  const local = PromptDefaultsFile.parse(BUNDLED_PROMPT_DEFAULTS);
  await mkdir(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `prompts-schema-${PROMPT_SCHEMA}.json`);
  await writeFile(file, `${JSON.stringify(local, null, 2)}\n`, { mode: 0o600 });
  const remote = readRemote(`https://github.com/${repo}/releases/download/prompts/prompts-schema-${PROMPT_SCHEMA}.json`);
  const decision = decidePublish(remote, local);
  if (dryRun) {
    console.log(`✓ prompts dry-run: ${decision}\n${file}`);
    return;
  }
  if (decision === "unchanged") {
    console.log("✓ prompts unchanged");
    return;
  }
  try {
    command("gh", ["release", "view", "prompts", "--repo", repo]);
  } catch (error) {
    if (!/release not found/i.test(String((error as { stderr?: string }).stderr))) throw error;
    command("gh", ["release", "create", "prompts", "--repo", repo, "--prerelease", "--title", "Default prompts", "--notes", "U3 기본 프롬프트 갱신용 자산입니다."]);
  }
  command("gh", ["release", "upload", "prompts", file, "--repo", repo, "--clobber"]);
  console.log(`✓ prompts published: schema ${local.schema} revision ${local.revision}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
