import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App";
const env = vi.hoisted(() => ({
  hooks: [] as any[], cursor: 0, pending: [] as (() => void)[], cleanups: [] as (() => void)[],
  handlers: new Map<string, () => void>(), unlisten: vi.fn(), invoke: vi.fn(), api: vi.fn(), reset: vi.fn(), toast: vi.fn(),
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useCallback: (callback: unknown, deps: unknown[]) => {
      const i = env.cursor++;
      if (!env.hooks[i] || deps.some((v, n) => !Object.is(v, env.hooks[i].deps[n]))) env.hooks[i] = { callback, deps };
      return env.hooks[i].callback;
    },
    useState: (initial: unknown) => {
      const i = env.cursor++;
      if (!(i in env.hooks)) env.hooks[i] = typeof initial === "function" ? initial() : initial;
      return [env.hooks[i], (next: unknown) => { env.hooks[i] = typeof next === "function" ? next(env.hooks[i]) : next; }];
    },
    useRef: (initial: unknown) => { const i = env.cursor++; if (!(i in env.hooks)) env.hooks[i] = { current: initial }; return env.hooks[i]; },
    useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
      const i = env.cursor++;
      if (!env.hooks[i] || deps.some((v, n) => !Object.is(v, env.hooks[i][n]))) {
        env.hooks[i] = deps; env.pending.push(() => { const cleanup = effect(); if (cleanup) env.cleanups.push(cleanup); });
      }
    },
  };
});
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: env.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async (name: string, handler: () => void) => { env.handlers.set(name, handler); return env.unlisten; } }));
vi.mock("../../src/ui/api", () => ({ api: env.api, resetConnection: env.reset }));
vi.mock("sonner", () => ({ toast: Object.assign(env.toast, { error: vi.fn() }) }));
vi.mock("../../src/ui/updater", async original => ({ ...await original<typeof import("../../src/ui/updater")>(), subscribeUpdates: async () => () => {} }));
vi.mock("../../src/ui/screens/Home", () => ({ Home: () => null }));
vi.mock("../../src/ui/screens/Input", () => ({ Input: () => null }));
vi.mock("../../src/ui/screens/Script", () => ({ Script: () => null }));
vi.mock("../../src/ui/screens/Studio", () => ({ Studio: () => null }));
vi.mock("../../src/ui/screens/Settings", () => ({ Settings: () => null }));
vi.mock("../../src/ui/screens/Carousels", () => ({ Carousels: () => null }));
vi.mock("../../src/ui/components/u3/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../../src/ui/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("../../src/ui/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../src/ui/components/ui/alert-dialog", () => ({ AlertDialog: () => null, AlertDialogContent: () => null, AlertDialogHeader: () => null, AlertDialogTitle: () => null, AlertDialogDescription: () => null, AlertDialogFooter: () => null, AlertDialogCancel: () => null, AlertDialogAction: () => null }));

beforeEach(() => {
  env.hooks.length = 0; env.cursor = 0; env.pending.length = 0; env.cleanups.length = 0; env.handlers.clear(); vi.clearAllMocks();
  env.invoke.mockResolvedValue({ port: 1234, token: "test" });
  env.api.mockResolvedValue({ capabilities: { tts: true } });
});
async function draw() {
  env.cursor = 0; const html = renderToStaticMarkup(<App />);
  for (const effect of env.pending.splice(0)) effect();
  await new Promise(resolve => setTimeout(resolve, 0));
  return html;
}
it("재시작 이벤트는 스낵바와 연결 재조회·상태 조회를 실행한다", async () => {
  await draw();
  expect(env.handlers.has("engine-restarted")).toBe(true);
  const before = env.invoke.mock.calls.length;
  env.handlers.get("engine-restarted")!();
  expect(env.reset).toHaveBeenCalledTimes(2);
  await draw();
  expect(env.invoke.mock.calls.length).toBe(before + 1);
  expect(env.api).toHaveBeenCalledWith("GET", "/api/system", undefined, expect.any(AbortSignal));
  expect(env.toast).toHaveBeenCalledWith("엔진을 다시 시작했어요. 마지막 작업을 다시 해 주세요", expect.any(Object));
  env.cleanups.forEach(cleanup => cleanup());
  expect(env.unlisten).toHaveBeenCalledTimes(2);
});
it("재시작 상한 이벤트는 재연결 오류 배너를 표시한다", async () => {
  await draw();
  expect(env.handlers.has("engine-stopped")).toBe(true);
  env.invoke.mockRejectedValue(new Error("엔진이 반복해서 멈췄어요. 앱을 다시 시작해 주세요"));
  env.handlers.get("engine-stopped")!();
  await draw();
  expect(await draw()).toContain("엔진이 반복해서 멈췄어요. 앱을 다시 시작해 주세요");
});
