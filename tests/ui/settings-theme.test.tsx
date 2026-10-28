import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSettings } from "../../src/ui/settings/ThemeSettings";
import * as themeState from "../../src/ui/theme-state";

const radio = vi.hoisted(() => ({ choose: undefined as undefined | ((value: string) => void) }));
// Radix의 선택 이벤트 경계만 대체하고 실제 테마 저장·html class 적용을 실행한다.
vi.mock("../../src/ui/components/ui/radio-group", () => ({
  RadioGroup: (props: { onValueChange: (value: string) => void; children: React.ReactNode }) => {
    radio.choose = props.onValueChange;
    return <div role="radiogroup">{props.children}</div>;
  },
  RadioGroupItem: (props: { value: string; "aria-label"?: string; id?: string }) => <button role="radio" id={props.id} aria-label={props["aria-label"]} value={props.value} />,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

describe("설정의 화면 테마 선택", () => {
  let dark: boolean;
  let stop: () => void;

  beforeEach(() => {
    dark = false;
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal("document", { documentElement: { classList: { toggle: (_className: string, enabled: boolean) => { dark = enabled; } } } });
    vi.stubGlobal("window", { matchMedia: () => Object.assign(new EventTarget(), { matches: true }) });
    stop = themeState.initializeTheme();
  });

  afterEach(() => { stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("세 선택지의 이름을 표시한다", () => {
    const markup = renderToStaticMarkup(<ThemeSettings />);
    for (const name of ["다크", "라이트", "시스템 설정 따르기"]) expect(markup).toContain(name);
  });

  it.each(["dark", "light", "system"] as const)("%s를 고르면 setTheme 호출과 html class 변경을 연결한다", value => {
    themeState.setTheme(value === "light" ? "dark" : "light");
    const setTheme = vi.spyOn(themeState, "setTheme");
    renderToStaticMarkup(<ThemeSettings />);
    expect(radio.choose).toBeTypeOf("function");
    radio.choose!(value);
    expect(setTheme).toHaveBeenCalledExactlyOnceWith(value);
    expect(themeState.getTheme()).toBe(value);
    expect(dark).toBe(value !== "light");
  });
});
