import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const workflow = readFileSync(path.join(import.meta.dirname, "../../.github/workflows/windows-build.yml"), "utf8");
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const next = workflow.slice(start + 1).search(/\n  [a-z-]+:\n/);
  return workflow.slice(start, next < 0 ? undefined : start + 1 + next);
}

// draft Release 는 쓰기 권한 토큰에만 보인다. inspect 가 draft 를 못 보면 Windows 작업이 시작되지 않는다.
it("draft Release 를 읽는 job 은 contents 쓰기 권한을 가진다", () => {
  for (const name of ["inspect", "windows-release", "publish"]) {
    expect(job(name), name).toMatch(/\n    permissions:\n      contents: write\n/);
  }
});
