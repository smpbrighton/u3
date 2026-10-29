import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEngineLog } from "../../src/engine/engine-log";

const roots: string[] = [];
function directory() {
  const root = mkdtempSync(path.join(os.tmpdir(), "u3-engine-log-"));
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("ISO 시각과 오류·파일 경로를 동기로 기록한다", () => {
  const log = createEngineLog({ dir: directory() });
  log.write("파일 실패 /data/project/a.mp4");
  expect(readFileSync(log.file, "utf8")).toMatch(/^\d{4}-\d\d-\d\dT.*Z 파일 실패 \/data\/project\/a.mp4\n$/);
});

it("기본 5MB를 넘으면 한 번 회전하고 기존 .1을 덮어쓴다", () => {
  const log = createEngineLog({ dir: directory() });
  log.write("a".repeat(5 * 1024 * 1024));
  log.write("두 번째");
  expect(statSync(`${log.file}.1`).size).toBeGreaterThan(5 * 1024 * 1024);
  expect(readFileSync(log.file, "utf8")).toContain("두 번째");
  const small = createEngineLog({ dir: path.dirname(log.file), maxBytes: 1 });
  small.write("세 번째");
  expect(readFileSync(`${log.file}.1`, "utf8")).toContain("두 번째");
  expect(readFileSync(`${log.file}.1`, "utf8")).not.toContain("aaa");
});

it.each([false, true])("시작·이전 종료·warn·error·rejection을 기록하고 예외 종료=%s를 유지한다", fatal => {
  const dir = directory();
  const script = `
    import { installEngineLog } from './src/engine/engine-log.ts';
    const keys = ['jev-private-value'];
    installEngineLog({ dir: ${JSON.stringify(dir)}, version: '0.3.8', secrets: () => keys });
    console.warn('파일 /data/a.mp4', process.env.U3_TOKEN, keys[0]);
    console.error(new Error('Authorization: Bearer header-private-value'));
    console.error({ headers: { Authorization: 'Basic basic-private-value' }, apiKey: 'unknown-key-value' });
    console.warn('http://127.0.0.1/media?token=query-private-value&file=a.mp4');
    keys.push('new-jev-private-value');
    console.warn('새 키', keys[1]);
    Promise.reject(new Error('rejection 기록'));
    setTimeout(() => { ${fatal ? "throw new Error('fatal 기록')" : "process.exit(0)"}; }, 30);
  `;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(), env: { ...process.env, U3_TOKEN: "token-private-value", U3_PREVIOUS_EXIT: "signal: 9" }, encoding: "utf8",
  });
  expect(child.status).toBe(fatal ? 1 : 0);
  const log = readFileSync(path.join(dir, "engine.log"), "utf8");
  for (const value of ["0.3.8", process.platform, "이전 엔진 종료: signal: 9", "/data/a.mp4", "rejection 기록"]) expect(log).toContain(value);
  if (fatal) expect(log).toContain("fatal 기록");
  for (const secret of ["token-private-value", "jev-private-value", "header-private-value", "basic-private-value", "unknown-key-value", "query-private-value", "new-jev-private-value"]) {
    expect(log.includes(secret)).toBe(false);
    expect(child.stderr.includes(secret)).toBe(false);
  }
  expect(child.stderr).not.toContain("rejection 기록");
});
