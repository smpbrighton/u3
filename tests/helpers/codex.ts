import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Windows는 codexCommand의 Node 진입점으로, POSIX는 Node shebang으로 실행한다. */
export async function fakeCodex(file: string, body: string): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return file;
}
