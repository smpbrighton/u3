import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
const read = (name: string) => readFile(new URL(`../../${name}`, import.meta.url), "utf8");
it("Windows bundle는 사용자별 NSIS와 Whisper만 선택한다", async () => {
  const config = JSON.parse(await read("src-tauri/tauri.windows.conf.json"));
  const mac = JSON.parse(await read("src-tauri/tauri.conf.json"));
  expect(config.bundle.targets).toEqual(["nsis"]);
  expect(config.bundle.externalBin).toEqual(["binaries/whisper-cli"]);
  expect(config.bundle.windows.nsis).toMatchObject({ installMode: "currentUser", languages: ["Korean", "English"], installerHooks: "windows-hooks.nsh" });
  expect(config.bundle.windows.webviewInstallMode.type).toBe("downloadBootstrapper");
  expect(config.bundle.createUpdaterArtifacts).toBe(true);
  expect(config.plugins.updater.pubkey).not.toBe(mac.plugins.updater.pubkey);
});
it("Windows engine은 Job Object와 콘솔 숨김으로 시작한다", async () => {
  const main = await read("src-tauri/src/main.rs"), job = await read("src-tauri/src/job.rs");
  expect(main).toContain("CREATE_NO_WINDOW");
  expect(main).toContain("app_local_data_dir");
  expect(job).toContain("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE");
  expect(job).toContain("AssignProcessToJobObject");
});
it("Windows helper는 현재 사용자 DPAPI와 보호된 DACL을 쓴다", async () => {
  const helper = await read("native/u3-key-store/src/windows.rs");
  expect(helper).toContain("CryptProtectData");
  expect(helper).toContain("CryptUnprotectData");
  expect(helper).not.toContain("CRYPTPROTECT_LOCAL_MACHINE");
  expect(helper).toContain("PROTECTED_DACL_SECURITY_INFORMATION");
  expect(helper).toContain("MoveFileExW");
});
