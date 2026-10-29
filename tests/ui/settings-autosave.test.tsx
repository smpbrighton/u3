import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/ui/screens/Settings";
import { DEFAULT_SCRIPT_PROMPT } from "../../src/core/script-prompt";

const events = vi.hoisted(() => ({
  fields: new Map<string, { onChange: (event: { target: { value: string } }) => void; onBlur: () => void; value: string; placeholder?: string }>(),
  section: "script",
  effects: [] as Array<() => void | (() => void)>,
  states: [] as unknown[],
  voiceStates: {} as Record<"tone" | "persona", { prompt: string; defaultPrompt: string; newerDefault: boolean; saved: string }>,
  carouselStates: {} as Record<"topic" | "video", { prompt: string; defaultPrompt: string; newerDefault: boolean; saved: string }>,
  resets: [] as Array<() => void>,
  api: vi.fn(),
  promptState: { prompt: "", defaultPrompt: "", newerDefault: false, saved: "" },
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const isPrompt = !!initial && typeof initial === "object" && "prompt" in initial;
    const isVoice = !!initial && typeof initial === "object" && "tone" in initial;
    const isCarousel = !!initial && typeof initial === "object" && "topic" in initial;
    const [value, setValue] = actual.useState(isPrompt ? events.promptState : isVoice ? events.voiceStates : isCarousel ? events.carouselStates : initial);
    return [initial === "screen" ? events.section : value, (next: unknown) => {
      events.states.push(next);
      if (isPrompt) events.promptState = next as typeof events.promptState;
      if (isVoice) events.voiceStates = next as typeof events.voiceStates;
      if (isCarousel) events.carouselStates = next as typeof events.carouselStates;
      setValue(next);
    }];
  }, useEffect: (effect: () => void | (() => void)) => { events.effects.push(effect); } };
});
// 입력과 기본값 버튼의 이벤트 경계만 노출한다. 실제 저장 함수와 큐를 실행한다.
vi.mock("../../src/ui/components/ui/textarea", () => ({ Textarea: (props: { "aria-label": string; value: string; onChange: (event: { target: { value: string } }) => void; onBlur: () => void }) => {
  events.fields.set(props["aria-label"], props);
  return <textarea aria-label={props["aria-label"]} />;
} }));
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (props: { children: React.ReactNode; onClick?: () => void }) => {
  if (props.children === "기본값으로" && props.onClick) events.resets.push(props.onClick);
  return <button>{props.children}</button>;
} }));
vi.mock("../../src/ui/settings/SettingsControls", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/ui/settings/SettingsControls")>(),
  SettingsIconButton: (props: { children: React.ReactNode }) => <button>{props.children}</button>,
}));
vi.mock("../../src/ui/api", () => ({ api: events.api }));
vi.mock("../../src/remotion/U3Short", () => ({ U3Short: () => null }));

const stateOf = (prompt: string, defaultPrompt = prompt, newerDefault = false) => ({ prompt, defaultPrompt, newerDefault, saved: prompt });
const response = (path: string, body: Record<string, string>) => {
  const states = path.endsWith("script-voice") ? events.voiceStates : events.carouselStates;
  if (path.endsWith("script-prompt")) {
    const value = body.prompt?.trim() || events.promptState.defaultPrompt;
    return { ...stateOf(value, events.promptState.defaultPrompt), isDefault: value === events.promptState.defaultPrompt };
  }
  return Object.fromEntries(Object.entries(states).map(([key, state]) => {
    const value = body[key] === undefined ? state.prompt : body[key]!.trim() || state.defaultPrompt;
    return [key, { ...stateOf(value, state.defaultPrompt), isDefault: value === state.defaultPrompt }];
  }));
};
const render = () => renderToStaticMarkup(<Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} />);
const cases = [
  ["대본 프롬프트", "script", "/api/system/script-prompt", "prompt"],
  ["말투", "script", "/api/system/script-voice", "tone"],
  ["성격", "script", "/api/system/script-voice", "persona"],
  ["캐러셀 기획 프롬프트 · 주제로", "imagegen", "/api/system/carousel-prompts", "topic"],
  ["캐러셀 기획 프롬프트 · 영상으로", "imagegen", "/api/system/carousel-prompts", "video"],
] as const;
beforeEach(() => {
  vi.useFakeTimers();
  events.api.mockReset(); events.fields.clear(); events.resets.length = 0; events.effects.length = 0; events.states.length = 0; events.section = "script";
  events.promptState = stateOf(DEFAULT_SCRIPT_PROMPT);
  events.voiceStates = { tone: stateOf("기본 말투"), persona: stateOf("기본 성격") };
  events.carouselStates = { topic: stateOf("기본 주제"), video: stateOf("기본 영상") };
  events.api.mockImplementation(async (_method, path, body) => response(path, body));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("여러 줄 설정의 자동 저장", () => {
  it.each([["대본 프롬프트", 0, "/api/system/script-prompt", { prompt: "" }], ["말투", 1, "/api/system/script-voice", { tone: "" }]] as const)("%s 저장 중 기본값으로 바꾸면 마지막 요청도 기본값이다", async (label, resetIndex, path, expected) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, path, body) => { await gate; return response(path, body); });
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

describe("다섯 프롬프트의 지연 저장과 해제 저장", () => {
  it.each(cases)("%s는 마지막 입력 1초 뒤 한 번 저장한다", async (label, section, path, key) => {
    events.section = section; render();
    const field = events.fields.get(label)!;
    field.onChange({ target: { value: "이전 입력" } });
    await vi.advanceTimersByTimeAsync(999);
    expect(events.api).not.toHaveBeenCalled();
    field.onChange({ target: { value: "마지막 입력" } });
    await vi.advanceTimersByTimeAsync(999);
    expect(events.api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(events.api).toHaveBeenCalledExactlyOnceWith("PUT", path, { [key]: "마지막 입력" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("%s는 입력 뒤 해제하면 남은 값을 즉시 저장한다", async (label, section, path, key) => {
    events.section = section; render();
    // 초기 조회와 작업 구독을 제외한 설정 저장 effect를 마운트하고 해제한다.
    const cleanups = events.effects.slice(2).map(effect => effect());
    events.fields.get(label)!.onChange({ target: { value: "화면을 떠나기 전 입력" } });
    expect(events.api).not.toHaveBeenCalled();
    for (const cleanup of cleanups) cleanup?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.api).toHaveBeenCalledExactlyOnceWith("PUT", path, { [key]: "화면을 떠나기 전 입력" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("%s는 blur에서 즉시 저장하고 타이머·해제는 중복 저장하지 않는다", async (label, section, path, key) => {
    events.section = section; render();
    const cleanups = events.effects.slice(2).map(effect => effect());
    const field = events.fields.get(label)!;
    field.onChange({ target: { value: "즉시 저장" } }); field.onBlur();
    // 첫 요청의 응답 전에 해제해도 같은 입력을 중복 전송하지 않는다.
    for (const cleanup of cleanups) cleanup?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.api).toHaveBeenCalledExactlyOnceWith("PUT", path, { [key]: "즉시 저장" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("%s는 바뀌지 않은 blur에서 저장하지 않는다", async (label, section) => {
    events.section = section; render(); events.fields.get(label)!.onBlur();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).not.toHaveBeenCalled();
  });

  it.each(cases)("%s의 늦은 응답은 새 입력을 덮지 않는다", async (label, section, path, key) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, path, body) => { await gate; return response(path, body); });
    events.section = section; render();
    const field = events.fields.get(label)!;
    field.onChange({ target: { value: "  이전 입력  " } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).toHaveBeenCalledTimes(1);
    field.onChange({ target: { value: "새 입력" } });
    finish(); await vi.advanceTimersByTimeAsync(0);
    const current = key === "prompt" ? events.promptState : key === "tone" || key === "persona" ? events.voiceStates[key] : events.carouselStates[key];
    expect(current.prompt).toBe("새 입력");
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.api).toHaveBeenLastCalledWith("PUT", path, { [key]: "새 입력" });
    expect(events.api).toHaveBeenCalledTimes(2);
  });
});

it.each([["tone", "말투", 1], ["persona", "성격", 2]] as const)("%s는 서버 기본값과 갱신 표시를 쓰고 빈 본문으로 초기화한다", async (kind, label, resetIndex) => {
  events.voiceStates[kind] = stateOf("내 설정", "원격 기본값", true);
  const html = render();
  expect(html.match(/새 기본값이 있어요/g)).toHaveLength(1);
  expect(events.fields.get(label)!.value).toBe("내 설정");
  expect(events.fields.get(label)!.placeholder).toBeUndefined();
  events.resets[resetIndex]!();
  await vi.advanceTimersByTimeAsync(0);
  expect(events.api).toHaveBeenCalledExactlyOnceWith("PUT", "/api/system/script-voice", { [kind]: "" });
  expect(events.voiceStates[kind].prompt).toBe("원격 기본값");
  expect(events.voiceStates[kind].newerDefault).toBe(false);
});
