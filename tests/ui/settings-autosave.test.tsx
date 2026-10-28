import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/ui/screens/Settings";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

const events = vi.hoisted(() => ({
  fields: new Map<string, { onChange: (event: { target: { value: string } }) => void; onBlur: () => void; value: string }>(),
  resets: [] as Array<() => void>,
  api: vi.fn(),
  promptState: { prompt: "", defaultPrompt: "", newerDefault: false, saved: "" },
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const isPrompt = !!initial && typeof initial === "object" && "prompt" in initial;
    const [value, setValue] = actual.useState(isPrompt ? events.promptState : initial);
    return [initial === "screen" ? "script" : value, setValue];
  } };
});
// 입력과 기본값 버튼의 이벤트 경계만 노출한다. 실제 저장 함수와 큐를 실행한다.
vi.mock("../../src/ui/components/ui/textarea", () => ({ Textarea: (props: { "aria-label": string; value: string; onChange: (event: { target: { value: string } }) => void; onBlur: () => void; value: string }) => {
  events.fields.set(props["aria-label"], props);
  return <textarea aria-label={props["aria-label"]} />;
} }));
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (props: { children: React.ReactNode; onClick?: () => void }) => {
  if (props.children === "기본값으로" && props.onClick) events.resets.push(props.onClick);
  return <button>{props.children}</button>;
} }));
vi.mock("../../src/ui/api", () => ({ api: events.api }));
vi.mock("../../src/remotion/U3Short", () => ({ U3Short: () => null }));

beforeEach(() => { events.api.mockReset(); events.fields.clear(); events.resets.length = 0; events.promptState = { prompt: DEFAULT_SCRIPT_PROMPT, defaultPrompt: DEFAULT_SCRIPT_PROMPT, newerDefault: false, saved: DEFAULT_SCRIPT_PROMPT }; });

describe("여러 줄 설정의 자동 저장", () => {
  it.each([["대본 프롬프트", 0, "/api/system/script-prompt", { prompt: "" }], ["말투", 1, "/api/system/script-voice", { tone: "", persona: "" }]] as const)("%s 저장 중 기본값으로 바꾸면 마지막 요청도 기본값이다", async (label, resetIndex, path, expected) => {
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

it("대본을 바꾸지 않은 blur는 저장하지 않는다", async () => {
  renderToStaticMarkup(<Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} />);
  events.fields.get("대본 프롬프트")!.onBlur();
  await Promise.resolve(); await Promise.resolve();
  expect(events.api).not.toHaveBeenCalled();
});

it("대본의 서버 기본값과 새 기본값 표시를 사용한다", async () => {
  events.promptState = { prompt: "고친 대본", defaultPrompt: "원격 대본", newerDefault: true, saved: "고친 대본" };
  events.api.mockResolvedValue({ prompt: "최신 원격 대본", defaultPrompt: "최신 원격 대본", newerDefault: false, isDefault: true });
  const html = renderToStaticMarkup(<Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} />);
  expect(html.match(/새 기본값이 있어요/g)).toHaveLength(1);
  events.fields.get("대본 프롬프트")!.onBlur();
  await Promise.resolve(); await Promise.resolve();
  expect(events.api).not.toHaveBeenCalled();
  events.resets[0]!();
  await vi.waitFor(() => expect(events.api).toHaveBeenCalledWith("PUT", "/api/system/script-prompt", { prompt: "" }));
});
