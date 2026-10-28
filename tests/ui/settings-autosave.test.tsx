import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/ui/screens/Settings";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

const events = vi.hoisted(() => ({
  fields: new Map<string, { onChange: (event: { target: { value: string } }) => void; onBlur: () => void }>(),
  resets: [] as Array<() => void>,
  api: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const [value, setValue] = actual.useState(initial);
    return [initial === "screen" ? "script" : value, setValue];
  } };
});
// 입력과 기본값 버튼의 이벤트 경계만 노출한다. 실제 저장 함수와 큐를 실행한다.
vi.mock("../../src/ui/components/ui/textarea", () => ({ Textarea: (props: { "aria-label": string; onChange: (event: { target: { value: string } }) => void; onBlur: () => void }) => {
  events.fields.set(props["aria-label"], props);
  return <textarea aria-label={props["aria-label"]} />;
} }));
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (props: { children: React.ReactNode; onClick?: () => void }) => {
  if (props.children === "기본값으로" && props.onClick) events.resets.push(props.onClick);
  return <button>{props.children}</button>;
} }));
vi.mock("../../src/ui/api", () => ({ api: events.api }));
vi.mock("../../src/remotion/U3Short", () => ({ U3Short: () => null }));

beforeEach(() => { events.api.mockReset(); events.fields.clear(); events.resets.length = 0; });

describe("여러 줄 설정의 자동 저장", () => {
  it.each([["대본 프롬프트", 0, "/api/system/script-prompt", { prompt: DEFAULT_SCRIPT_PROMPT }], ["말투", 1, "/api/system/script-voice", { tone: "", persona: "" }]] as const)("%s 저장 중 기본값으로 바꾸면 마지막 요청도 기본값이다", async (label, resetIndex, path, expected) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, _path, body) => { await gate; return body; });
    renderToStaticMarkup(<Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} />);
    const field = events.fields.get(label)!;
    field.onChange({ target: { value: "직접 쓴 설정" } });
    expect(events.api).not.toHaveBeenCalled();
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(1));
    events.resets[resetIndex]!();
    finish();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(2));
    expect(events.api).toHaveBeenLastCalledWith("PUT", path, expected);
  });
});
