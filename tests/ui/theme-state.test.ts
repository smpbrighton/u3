import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTheme, getResolvedTheme, initializeTheme, setTheme, subscribeTheme } from "../../src/ui/theme-state";

const tauri = vi.hoisted(() => ({ enabled: false, setBackgroundColor: vi.fn(async (_color: string) => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => tauri.enabled }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setBackgroundColor: tauri.setBackgroundColor }) }));

describe("화면 테마", () => {
  let stored: Map<string, string>;
  let classes: Set<string>;
  let media: EventTarget & { matches: boolean; media: string };
  let stop: (() => void) | undefined;

  beforeEach(() => {
    stored = new Map();
    classes = new Set(["existing"]);
    media = Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: dark)" });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("document", { documentElement: { classList: {
      toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
    } } });
    vi.stubGlobal("window", { matchMedia: vi.fn(() => media) });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => classes.has("dark") ? "#0e0e10" : "#ffffff" }));
    tauri.enabled = false;
    tauri.setBackgroundColor.mockClear();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.unstubAllGlobals();
  });

  function changeSystem(dark: boolean) {
    media.matches = dark;
    media.dispatchEvent(new Event("change"));
  }

  it("저장값이 없으면 첫 그리기 전에 다크를 동기로 적용한다", () => {
    stop = initializeTheme();
    expect(getTheme()).toBe("dark");
    expect(getResolvedTheme()).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(classes.has("existing")).toBe(true);
  });

  it.each(["dark", "light", "system"] as const)("%s 선택을 저장하고 다시 열 때 복원한다", theme => {
    stop = initializeTheme();
    setTheme(theme);
    expect(stored.get("u3.uiTheme")).toBe(theme);
    stop();
    stop = initializeTheme();
    expect(getTheme()).toBe(theme);
    expect(getResolvedTheme()).toBe(theme === "dark" ? "dark" : "light");
    expect(classes.has("dark")).toBe(theme === "dark");
  });

  it("다크·라이트 선택은 html의 dark class를 바꾼다", () => {
    stop = initializeTheme();
    setTheme("light");
    expect(classes.has("dark")).toBe(false);
    setTheme("dark");
    expect(classes.has("dark")).toBe(true);
  });

  it("복원한 시스템 선택은 현재 모양과 이후 변경을 따른다", () => {
    stored.set("u3.uiTheme", "system");
    media.matches = true;
    stop = initializeTheme();
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(classes.has("dark")).toBe(true);
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    changeSystem(false);
    expect(getTheme()).toBe("system");
    expect(getResolvedTheme()).toBe("light");
    expect(classes.has("dark")).toBe(false);
    changeSystem(true);
    expect(getResolvedTheme()).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("명시한 다크·라이트는 시스템 변경의 영향을 받지 않는다", () => {
    stop = initializeTheme();
    changeSystem(false);
    expect(getResolvedTheme()).toBe("dark");
    setTheme("light");
    changeSystem(true);
    expect(getResolvedTheme()).toBe("light");
  });

  it("잘못된 저장값은 기본 다크로 복원한다", () => {
    stored.set("u3.uiTheme", "invalid");
    stop = initializeTheme();
    expect(getTheme()).toBe("dark");
    expect(classes.has("dark")).toBe(true);
  });

  it("브라우저에서는 Tauri 창 API를 호출하지 않는다", () => {
    stop = initializeTheme();
    setTheme("light");
    expect(tauri.setBackgroundColor).not.toHaveBeenCalled();
  });

  it("Tauri 창 배경은 테마의 background 토큰을 따른다", () => {
    tauri.enabled = true;
    stop = initializeTheme();
    expect(tauri.setBackgroundColor).toHaveBeenLastCalledWith("#0e0e10");
    setTheme("light");
    expect(tauri.setBackgroundColor).toHaveBeenLastCalledWith("#ffffff");
  });
});
