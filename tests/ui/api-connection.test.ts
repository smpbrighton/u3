import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, resetConnection } from "../../src/ui/api";
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: bridge.invoke }));
beforeEach(() => { resetConnection(); bridge.invoke.mockReset().mockResolvedValue({ port: 1234, token: "first" }); });
afterEach(() => vi.unstubAllGlobals());

it("fetch 실패 요청은 재전송하지 않고 다음 호출에서 연결을 다시 조회한다", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("POST", "/api/projects", { name: "새 영상" })).rejects.toThrow("엔진에 연결하지 못했습니다");
  expect(fetch).toHaveBeenCalledTimes(1);
  bridge.invoke.mockResolvedValue({ port: 2345, token: "second" });
  await expect(api("GET", "/api/system")).resolves.toEqual({ ok: true });
  expect(bridge.invoke).toHaveBeenCalledTimes(2);
  expect((fetch.mock.calls[1]![1] as RequestInit).headers).toEqual(expect.any(Headers));
  expect(new Headers(fetch.mock.calls[1]![1].headers).get("authorization")).toBe("Bearer second");
});

it("AbortError는 연결을 지우지 않는다", async () => {
  const error = new DOMException("중단", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(Response.json({})));
  await expect(api("GET", "/api/system")).rejects.toBe(error);
  await api("GET", "/api/system");
  expect(bridge.invoke).toHaveBeenCalledTimes(1);
});

it("HTTP 오류는 연결을 지우지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: { message: "거부" } }, { status: 400 })).mockResolvedValueOnce(Response.json({})));
  await expect(api("GET", "/api/system")).rejects.toThrow("거부");
  await api("GET", "/api/system");
  expect(bridge.invoke).toHaveBeenCalledTimes(1);
});
