import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STUDIO_SHORTCUTS as defaults, STUDIO_ACTIONS, type StudioShortcutTable } from "../../src/core/studio-shortcuts";
import { ShortcutSettings } from "../../src/ui/settings/ShortcutSettings";
import { SettingsSaves } from "../../src/ui/settings/settings-save";
import { ApiError } from "../../src/ui/api";

const events = vi.hoisted(() => ({
  api: vi.fn(), fields: new Map<string, React.ComponentProps<"input">>(), resets: [] as React.ComponentProps<"button">[],
  hooks: [] as unknown[], cursor: 0,
}));
// DOM 없이 재렌더 사이의 훅 상태를 보존하고 입력 이벤트 경계를 실행한다.
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = events.cursor++;
      if (!(index in events.hooks)) events.hooks[index] = typeof initial === "function" ? initial() : initial;
      return [events.hooks[index], (next: unknown) => { events.hooks[index] = typeof next === "function" ? next(events.hooks[index]) : next; }];
    },
    useRef: (initial: unknown) => {
      const index = events.cursor++;
      if (!(index in events.hooks)) events.hooks[index] = { current: initial };
      return events.hooks[index];
    },
  };
});
vi.mock("../../src/ui/components/ui/input", () => ({ Input: (props: React.ComponentProps<"input">) => {
  events.fields.set(props.id!, props);
  return <input {...props} />;
} }));
vi.mock("../../src/ui/components/ui/button", () => ({ Button: ({ variant: _variant, size: _size, ...props }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => {
  events.resets.push(props);
  return <button {...props} />;
} }));
vi.mock("../../src/ui/api", async importOriginal => ({ ...await importOriginal<typeof import("../../src/ui/api")>(), api: events.api }));

beforeEach(() => {
  events.api.mockReset(); events.hooks.length = 0; events.cursor = 0; events.fields.clear(); events.resets.length = 0;
  vi.stubGlobal("navigator", { platform: "MacIntel" });
});

function setup(shortcuts: StudioShortcutTable = defaults) {
  const saves = new SettingsSaves();
  const onShortcuts = vi.fn();
  const render = () => {
    events.cursor = 0; events.fields.clear(); events.resets.length = 0;
    return renderToStaticMarkup(<ShortcutSettings shortcuts={shortcuts} saves={saves} onShortcuts={onShortcuts} />);
  };
  render();
  const field = (id = "split-pointer") => events.fields.get(`shortcut-${id}`)!;
  const focus = (id = "split-pointer") => field(id).onFocus!({} as never);
  const key = (code: string, options: Partial<React.KeyboardEvent<HTMLInputElement>> = {}, id = "split-pointer") => {
    field(id).onKeyDown!({ code, key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { blur: vi.fn() }, ...options } as unknown as React.KeyboardEvent<HTMLInputElement>);
  };
  return { saves, onShortcuts, render, field, focus, key };
}

describe("단축키 설정", () => {
  it("여덟 행에 연결된 입력 칸과 기본값 버튼을 표시한다", () => {
    const view = setup(); const markup = view.render();
    expect(events.fields.size).toBe(8);
    expect(events.resets).toHaveLength(8);
    expect(events.resets.every(button => button.disabled)).toBe(true);
    for (const { id, label } of STUDIO_ACTIONS) {
      expect(markup).toContain(`for="shortcut-${id}"`);
      expect(markup).toContain(label);
      expect(view.field(id).readOnly).toBe(true);
      expect(view.field(id).placeholder).toBeUndefined();
    }
    view.focus(); view.render();
    expect(view.field().value).toBe("키 입력 중");
  });

  it("한글 물리 키를 기록하고 응답 표로 자동 저장한다", async () => {
    const view = setup();
    events.api.mockImplementation(async (_method, _path, body) => ({ bindings: body }));
    view.focus(); view.key("KeyX", { key: "ㅌ" });
    await view.saves.flush();
    const expected = { ...defaults, "split-pointer": "KeyX" };
    expect(events.api).toHaveBeenCalledExactlyOnceWith("PUT", "/api/system/studio-shortcuts", expected);
    expect(view.onShortcuts).toHaveBeenCalledWith(expected);
    view.render(); expect(view.field().value).toBe("X");
  });

  it("수정키만·반복 입력은 무시하고 Escape와 blur로 기록을 취소한다", async () => {
    const view = setup();
    view.focus(); view.key("ShiftLeft", { key: "Shift", shiftKey: true }); view.key("KeyX", { repeat: true });
    view.render(); expect(view.field().value).toBe("키 입력 중");
    view.key("Escape"); view.key("KeyX");
    view.render(); expect(view.field().value).toBe("C");
    view.focus(); view.field().onBlur!({} as never); view.key("KeyX");
    await view.saves.flush(); expect(events.api).not.toHaveBeenCalled();
  });

  it.each([["KeyS", {}, "재생 헤드 자르기에서 사용 중이에요"], ["KeyC", { metaKey: true }, "글 편집에 사용하는 조합이에요"], ["KeyW", { metaKey: true }, "시스템에서 사용하는 조합이에요"], ["Tab", {}, "시스템에서 사용하는 조합이에요"]])("충돌 %s는 오류 한 줄을 표시하고 이전 값을 유지한다", async (code, modifiers, message) => {
    const view = setup(); view.focus(); view.key(code as string, modifiers as Partial<React.KeyboardEvent<HTMLInputElement>>);
    await view.saves.flush();
    const markup = view.render();
    expect(events.api).not.toHaveBeenCalled();
    expect(view.onShortcuts).not.toHaveBeenCalled();
    expect(markup.match(/role="alert"/g)).toHaveLength(1);
    expect(markup).toContain(message);
    expect(view.field().value).toBe("C");
    expect(view.field()["aria-invalid"]).toBe(true);
    expect(markup).toContain(`id="${view.field()["aria-describedby"]}"`);
  });

  it("서버 400의 행 오류와 이전 값을 유지한다", async () => {
    const view = setup();
    events.api.mockRejectedValue(new ApiError("시스템에서 사용하는 조합이에요", "shortcut-conflict", { action: "split-pointer", conflict: { kind: "system" } }));
    view.focus(); view.key("KeyX");
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(1));
    await expect(view.saves.flush()).rejects.toThrow("시스템에서 사용하는 조합이에요");
    const markup = view.render();
    expect(markup).toContain("시스템에서 사용하는 조합이에요");
    expect(view.field().value).toBe("C");
    expect(view.onShortcuts).not.toHaveBeenCalled();
  });

  it("기본값으로도 충돌을 검사한다", async () => {
    const view = setup({ ...defaults, "split-pointer": "KeyX", group: "KeyC" });
    events.resets[0]!.onClick!({} as never);
    await view.saves.flush();
    expect(events.api).not.toHaveBeenCalled();
    expect(view.render()).toContain("묶기에서 사용 중이에요");
    expect(view.field().value).toBe("X");
  });

  it("저장 중의 연속 변경과 기본값 복원을 큐 순서대로 반영한다", async () => {
    const view = setup();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, _path, body) => { await gate; return { bindings: body }; });
    view.focus(); view.key("KeyX");
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(1));
    view.focus("group"); view.key("KeyG", {}, "group");
    finish(); await view.saves.flush();
    expect(events.api).toHaveBeenLastCalledWith("PUT", "/api/system/studio-shortcuts", { ...defaults, "split-pointer": "KeyX", group: "KeyG" });
    view.render(); events.resets[0]!.onClick!({} as never); await view.saves.flush();
    expect(events.api).toHaveBeenLastCalledWith("PUT", "/api/system/studio-shortcuts", { ...defaults, group: "KeyG" });
    view.render(); expect(view.field().value).toBe("C");
  });
});
