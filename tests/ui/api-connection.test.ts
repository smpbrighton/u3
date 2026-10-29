import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, resetConnection } from "../../src/ui/api";
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: bridge.invoke }));
beforeEach(() => { resetConnection(); bridge.invoke.mockReset().mockResolvedValue({ port: 1234, token: "first" }); });
afterEach(() => vi.unstubAllGlobals());

it("fetch 실패 요청은 재전송하지 않고 다음 호출에서 연결을 다시 조회한다", async () => {
  bridge.invoke.mockResolvedValueOnce({ port: 1234, token: "first" }).mockResolvedValue({ port: 2345, token: "second" });
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json({ ok: true })).mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("POST", "/api/projects", { name: "새 영상" })).rejects.toThrow("엔진에 연결하지 못했습니다");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/api/projects"))).toHaveLength(1);
  expect(String(fetch.mock.calls[1]![0])).toContain("/api/system/client-log");
  expect(fetch.mock.calls[1]![1]).toMatchObject({ method: "POST", body: JSON.stringify({ method: "POST", path: "/api/projects", message: "offline" }) });
  expect(new Headers(fetch.mock.calls[1]![1].headers).get("authorization")).toBe("Bearer second");
  await expect(api("GET", "/api/system")).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(bridge.invoke).toHaveBeenCalledTimes(2);
  expect((fetch.mock.calls[2]![1] as RequestInit).headers).toEqual(expect.any(Headers));
  expect(new Headers(fetch.mock.calls[2]![1].headers).get("authorization")).toBe("Bearer second");
});

it("AbortError는 연결을 지우지 않는다", async () => {
  const error = new DOMException("중단", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(Response.json({})));
  await expect(api("GET", "/api/system")).rejects.toBe(error);
  await api("GET", "/api/system");
  expect(bridge.invoke).toHaveBeenCalledTimes(1);
});

it("실패 보고는 쿼리·본문을 빼고 한 번 보내며 보고 실패를 버린다", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));
  vi.stubGlobal("fetch", fetch);
  await expect(api("POST", "/api/projects?token=query-secret&name=query-private", { private: "body-private" })).rejects.toThrow("엔진에 연결하지 못했습니다: Load failed");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1]![0])).toContain("/api/system/client-log");
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ method: "POST", path: "/api/projects", message: "Load failed" });
});

it("client-log 자신의 fetch 실패는 다시 보고하지 않는다", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetch);
  await expect(api("POST", "/api/system/client-log?source=test", {})).rejects.toThrow("엔진에 연결하지 못했습니다: offline");
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("연결 실패 보고는 경로·오류 문구 길이 상한 안으로 보낸다", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("m".repeat(700))).mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("GET", `/api/${"p".repeat(600)}`)).rejects.toThrow("엔진에 연결하지 못했습니다");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ method: "GET", path: `/api/${"p".repeat(495)}`, message: "m".repeat(500) });
});

it("HTTP 오류는 연결을 지우지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: { message: "거부" } }, { status: 400 })).mockResolvedValueOnce(Response.json({})));
  await expect(api("GET", "/api/system")).rejects.toThrow("거부");
  await api("GET", "/api/system");
  expect(bridge.invoke).toHaveBeenCalledTimes(1);
});
