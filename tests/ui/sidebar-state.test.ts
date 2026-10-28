import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSidebarCollapsed, saveSidebarCollapsed } from "../../src/ui/sidebar-state";

describe("사이드바 접힘 상태", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("저장값이 없으면 펼쳐서 시작한다", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it.each([true, false])("접힘 %s를 저장하고 다시 열 때 복원한다", collapsed => {
    saveSidebarCollapsed(collapsed);
    expect(stored.get("u3.sidebarCollapsed")).toBe(String(collapsed));
    expect(readSidebarCollapsed()).toBe(collapsed);
  });

  it("잘못된 저장값은 펼침으로 복원한다", () => {
    stored.set("u3.sidebarCollapsed", "invalid");
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("저장소가 막혀도 펼쳐서 시작하고 저장 실패를 던지지 않는다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("저장소 사용 불가"); },
      setItem: () => { throw new Error("저장소 사용 불가"); },
    });
    expect(readSidebarCollapsed()).toBe(false);
    expect(() => saveSidebarCollapsed(true)).not.toThrow();
  });
});
