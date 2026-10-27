import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assignment = /(?:\bTYPESAFE_API_KEY\b|\[\s*["']TYPESAFE_API_KEY["']\s*\])\s*(?:\?\?=|\|\|=|&&=|=(?!=|>))/;

async function engineFiles(target) {
  const info = await stat(target);
  if (info.isFile()) return [target];
  if (!info.isDirectory()) throw new Error("invalid target");
  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile() && item.name === "engine.mjs") files.push(file);
    }
  }
  await walk(target);
  if (!files.length) throw new Error("missing engine");
  return files;
}

try {
  if (process.argv.length !== 3) throw new Error("missing target");
  const keys = new Set();
  const addKey = value => { if (value?.trim()) keys.add(value.trim()); };
  addKey(process.env.TYPESAFE_API_KEY);
  // 빌드 입력으로 사용하지 않는다. 키 유출 여부만 검사하며 값·경로·본문을 출력하지 않는다.
  const envFiles = new Set([path.join(root, ".env"), ...(process.env.U3_ENV_FILE ? [process.env.U3_ENV_FILE] : [])]);
  for (const file of envFiles) {
    try { addKey(parseEnv(await readFile(file, "utf8")).TYPESAFE_API_KEY); }
    catch (error) { if (error?.code !== "ENOENT") throw new Error("unreadable key file"); }
  }
  const needles = [...keys].flatMap(key => [key, JSON.stringify(key).slice(1, -1)]);
  for (const file of await engineFiles(process.argv[2])) {
    const source = await readFile(file, "utf8");
    if (assignment.test(source) || needles.some(key => source.includes(key))) throw new Error("embedded key");
  }
  process.stdout.write("✓ engine key check passed\n");
} catch {
  process.stderr.write("엔진 키 검사가 실패했습니다. 키 대입·키 포함 여부와 검사 파일을 확인하세요.\n");
  process.exitCode = 1;
}
