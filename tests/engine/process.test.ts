import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const children = new Set<ReturnType<typeof spawn>>();

afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
});

describe("engine process lifecycle", () => {
  it("exits after its parent closes stdin", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "u3-engine-process-test-"));
    const child = spawn(process.execPath, ["--import", "tsx", "src/engine/main.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, U3_TOKEN: "secret", U3_DATA_DIR: dataRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`엔진이 PORT 응답을 보내지 않았습니다: ${output}`)), 15_000);
      child.stdout.on("data", () => {
        if (output.includes("PORT ")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("엔진이 stdin 종료 뒤 2초 안에 끝나지 않았습니다")), 2_000);
      child.once("exit", code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    expect(exitCode).toBe(0);
    children.delete(child);
    await rm(dataRoot, { recursive: true, force: true });
  });
});
