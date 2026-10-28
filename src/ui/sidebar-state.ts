export const SIDEBAR_STORAGE_KEY = "u3.sidebarCollapsed";

export function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"; }
  catch { return false; }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed)); }
  catch { /* 저장소가 막혀도 현재 창의 접힘 상태는 유지한다. */ }
}
