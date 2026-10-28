import { SPAWN_OPTIONS } from "./spawn-options";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export interface JevKeyStore {
  readJevKey(): Promise<string | null>;
  saveJevKey(key: string): Promise<void>;
  deleteJevKey(): Promise<void>;
}

/** security -i의 split_line 구문. 셸은 실행하지 않는다. */
function quote(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

export function createJevKeyStore(options: {
  securityPath?: string;
  keychainPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): JevKeyStore {
  const securityPath = options.securityPath ?? "/usr/bin/security";
  const keychainPath = options.keychainPath ?? path.join(homedir(), "Library/Keychains/login.keychain-db");
  const env = options.env ?? process.env;
  const identity = ["-a", "u3", "-s", "u3-jev-api-key"];
  let cached: string | null | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  // 진행 중인 읽기가 저장·삭제 뒤의 캐시를 덮어쓰지 않도록 순서를 지킨다.
  function sequential<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  function run(args: string[], input = ""): Promise<{ code: number | null; stdout: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(securityPath, args, { ...SPAWN_OPTIONS, cwd: path.dirname(keychainPath), stdio: ["pipe", "pipe", "ignore"] });
      let stdout = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 32_768) child.kill("SIGKILL");
      });
      // security의 원문 오류에는 입력이 포함될 수 있으므로 밖으로 전달하지 않는다.
      child.on("error", () => { clearTimeout(timer); reject(new Error("Keychain 실행에 실패했습니다")); });
      child.on("close", code => { clearTimeout(timer); resolve({ code, stdout }); });
      child.stdin.on("error", () => { /* 조기 종료 결과는 close에서 처리한다. */ });
      child.stdin.end(input);
    });
  }

  return {
    readJevKey: () => sequential(async () => {
      // 설치본(U3_RESOURCE_DIR 있음)은 GUI 환경에 키가 있어도 설정에 입력한 Keychain 키만 쓴다.
      const developmentKey = env.U3_RESOURCE_DIR ? undefined : env.TYPESAFE_API_KEY?.trim();
      if (developmentKey) return developmentKey;
      if (cached !== undefined) return cached;
      try {
        const result = await run(["find-generic-password", ...identity, "-w", keychainPath]);
        if (result.code === 0) cached = result.stdout.trim() || null;
        else if (result.code === 44) cached = null; // errSecItemNotFound
      } catch { /* Keychain이 없거나 잠겼으면 규칙 점수로 진행한다. 다음 호출에 다시 읽는다. */ }
      return cached ?? null;
    }),
    saveJevKey: key => sequential(async () => {
      if (!key || key.length > 4000 || /[\x00-\x1f\x7f]/.test(key)) throw new Error("Keychain에 저장할 키 형식을 확인해 주세요");
      // -w 프롬프트(getpass)는 128자로 잘린다. -i 명령은 stdin으로 전달한다.
      // security 의 getopt 는 첫 위치 인자(키체인 이름) 뒤의 옵션을 받지 않는다. -w 를 키체인 이름 앞에 둔다.
      const command = `add-generic-password -U ${identity.join(" ")} -w ${quote(key)} ${quote(path.basename(keychainPath))}`;
      // SecurityTool의 MAX_LINE_LEN=4096. 잘림과 다음 명령 해석을 실행 전에 막는다.
      if (Buffer.byteLength(command) >= 4095) throw new Error("Keychain에 저장할 키 길이를 확인해 주세요");
      const result = await run(["-i"], `${command}\n`);
      if (result.code !== 0) throw new Error("Jev 키를 Keychain에 저장하지 못했습니다");
      cached = key;
    }),
    deleteJevKey: () => sequential(async () => {
      const result = await run(["delete-generic-password", ...identity, keychainPath]);
      if (result.code !== 0 && result.code !== 44) throw new Error("Jev 키를 Keychain에서 지우지 못했습니다");
      cached = null;
    }),
  };
}

const keys = createJevKeyStore();
export const { readJevKey, saveJevKey, deleteJevKey } = keys;
