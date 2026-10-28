import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codexLoginStatus, codexVersion, findCodexPath } from "../../src/engine/pipeline/codex-path";
import { Store } from "../../src/engine/store";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, access: vi.fn(actual.access) };
});

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function executable(file: string, body = 'echo "codex-cli 0.165.0"') {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

async function home() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "u3-codex-path-")); roots.push(root);
  vi.stubEnv("HOME", root); vi.stubEnv("PATH", "/no-path");
  vi.stubEnv("SHELL", await executable(path.join(root, "shell"), "exit 1"));
  const { access } = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.access).mockImplementation((file, mode) => {
    if (!String(file).startsWith(`${root}${path.sep}`)) return Promise.reject(new Error("가짜 HOME 밖 후보"));
    return access(file, mode);
  });
  return root;
}

describe("Codex 경로와 버전", () => {
  it("셸이 실패해도 가짜 HOME의 standalone을 찾고 설정에는 쓰지 않는다", async () => {
    const root = await home(); const store = new Store(root);
    const bin = await executable(path.join(root, ".codex/packages/standalone/current/bin/codex"));
    expect(await findCodexPath(store)).toBe(bin);
    expect(await store.readSettings()).toEqual({});
  });
  it("실행 가능한 설정 경로를 우선하고 잘못된 설정은 건너뛴다", async () => {
    const root = await home(); const store = new Store(root);
    const bin = await executable(path.join(root, "custom-codex"));
    const fallback = await executable(path.join(root, ".local/bin/codex"));
    await store.saveSettings({ codexPath: bin }); expect(await findCodexPath(store)).toBe(bin);
    await store.saveSettings({ codexPath: path.join(root, "missing") }); expect(await findCodexPath(store)).toBe(fallback);
  });
  it("대화형 셸에서 TERM=dumb과 닫힌 stdin으로 경로를 찾는다", async () => {
    const root = await home(); const bin = await executable(path.join(root, "interactive-codex"));
    vi.stubEnv("SHELL", await executable(path.join(root, "shell"), `if [ "$1" = "-lc" ]; then exit 1; fi\n[ "$1" = "-ilc" ] || exit 1\n[ "$TERM" = "dumb" ] || exit 1\nif read answer; then exit 1; fi\nprintf '%s\\n' '${bin}'`));
    expect(await findCodexPath()).toBe(bin);
  });
  it("실행 불가 파일을 건너뛰고 최신 nvm 버전을 고른다", async () => {
    const root = await home();
    const standalone = await executable(path.join(root, ".codex/packages/standalone/current/bin/codex"));
    await fs.chmod(standalone, 0o644);
    await executable(path.join(root, ".nvm/versions/node/v9.0.0/bin/codex"));
    const latest = await executable(path.join(root, ".nvm/versions/node/v24.10.0/bin/codex"));
    await executable(path.join(root, ".nvm/versions/node/v22.9.0/bin/codex"));
    expect(await findCodexPath()).toBe(latest);
  });
  it("실행 파일이 없으면 null을 반환한다", async () => {
    await home(); expect(await findCodexPath()).toBeNull();
  });
  it.each([["0.165.0", false], ["0.153.4", true], ["0.159.3", false]])("codex-cli %s를 파싱하고 outdated=%s를 반환한다", async (version, outdated) => {
    const root = await home();
    const bin = await executable(path.join(root, "codex"), `if [ "$1" = "--version" ]; then echo 'codex-cli ${version}'; else echo 'Logged in using ChatGPT' >&2; fi`);
    expect(await codexVersion(bin)).toBe(version);
    expect(await codexLoginStatus(bin)).toMatchObject({ installed: true, loggedIn: true, version, outdated });
  });
  it("로그인 실패와 실행 파일 부재를 구분하고 버전 조회 실패를 허용한다", async () => {
    const root = await home();
    const bin = await executable(path.join(root, "codex"), 'if [ "$1" = "--version" ]; then echo unknown; exit 0; fi\nexit 1');
    expect(await codexVersion(bin)).toBeNull();
    expect(await codexLoginStatus(bin)).toMatchObject({ installed: true, loggedIn: false, version: null, outdated: false });
    expect(await codexLoginStatus(path.join(root, "missing"))).toMatchObject({ installed: false, loggedIn: false, version: null, outdated: false });
  });
});
