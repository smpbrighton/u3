import { spawn } from "node:child_process";
import type { JevKeyStore } from "./jev-key";
import { SPAWN_OPTIONS } from "./spawn-options";

export function createDpapiKeyStore(options: { helperPath: string; filePath: string }): JevKeyStore {
  let cached: string | null | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  function sequential<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  function run(operation: "read" | "write" | "delete", input = ""): Promise<{ code: number | null; stdout: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.helperPath, [operation, options.filePath], { ...SPAWN_OPTIONS, stdio: ["pipe", "pipe", "ignore"] });
      let stdout = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; if (stdout.length > 32_768) child.kill("SIGKILL"); });
      child.on("error", () => { clearTimeout(timer); reject(new Error("보안 저장소 실행에 실패했습니다")); });
      child.on("close", code => { clearTimeout(timer); resolve({ code, stdout }); });
      child.stdin.on("error", () => { /* helper 종료 코드는 close에서 처리한다. */ });
      child.stdin.end(input);
    });
  }
  return {
    readJevKey: () => sequential(async () => {
      if (cached !== undefined) return cached;
      try {
        const result = await run("read");
        if (result.code === 0) cached = result.stdout.trim() || null;
        else if (result.code === 44) cached = null;
      } catch { /* 다음 요청에서 다시 읽고 현재 요청은 규칙 점수를 쓴다. */ }
      return cached ?? null;
    }),
    saveJevKey: key => sequential(async () => {
      if (!key || key.length > 4000 || /[\x00-\x1f\x7f]/.test(key)) throw new Error("보안 저장소에 저장할 키 형식을 확인해 주세요");
      if ((await run("write", key)).code !== 0) throw new Error("Jev 키를 보안 저장소에 저장하지 못했습니다");
      cached = key;
    }),
    deleteJevKey: () => sequential(async () => {
      const result = await run("delete");
      if (result.code !== 0 && result.code !== 44) throw new Error("Jev 키를 보안 저장소에서 지우지 못했습니다");
      cached = null;
    }),
  };
}
