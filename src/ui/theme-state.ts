import { useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type UiTheme = "dark" | "light" | "system";
export type ResolvedTheme = Exclude<UiTheme, "system">;
export const THEME_STORAGE_KEY = "u3.uiTheme";

let theme: UiTheme = "dark";
let resolvedTheme: ResolvedTheme = "dark";
let media: MediaQueryList | undefined;
let dispose: (() => void) | undefined;
const listeners = new Set<() => void>();

export const getTheme = () => theme;
export const getResolvedTheme = () => resolvedTheme;
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useTheme = () => useSyncExternalStore(subscribeTheme, getTheme, () => "dark" as const);
export const useResolvedTheme = () => useSyncExternalStore(subscribeTheme, getResolvedTheme, () => "dark" as const);

function applyTheme() {
  resolvedTheme = theme === "system" ? (media?.matches ? "dark" : "light") : theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  if (isTauri()) {
    const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (background) {
      void getCurrentWindow().setBackgroundColor(background).catch(error => {
        console.error("창 배경색을 바꾸지 못했습니다.", error);
      });
    }
  }
  listeners.forEach(listener => listener());
}

/** main.tsx의 createRoot 앞에서 호출한다. class 적용에는 비동기 작업이 없다. */
export function initializeTheme() {
  dispose?.();
  let stored: string | null = null;
  try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* 저장소가 막혀도 기본 테마를 쓴다. */ }
  theme = stored === "light" || stored === "system" ? stored : "dark";
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  media = query;
  const onSystemChange = () => { if (theme === "system") applyTheme(); };
  query.addEventListener("change", onSystemChange);
  applyTheme();
  const cleanup = () => {
    query.removeEventListener("change", onSystemChange);
    if (media === query) media = undefined;
    if (dispose === cleanup) dispose = undefined;
  };
  dispose = cleanup;
  return cleanup;
}

export function setTheme(next: UiTheme) {
  theme = next;
  try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* 저장 실패와 관계없이 현재 창에는 적용한다. */ }
  applyTheme();
}
