import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/ui/screens/Settings";
import { CAROUSEL_PROMPT_MAX_LENGTH, DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../src/core/carousel-prompt";

type Field = {
  "aria-label": string; value: string; maxLength: number; placeholder?: string; className: string;
  onChange: (event: { target: { value: string } }) => void; onBlur: () => void;
};
const events = vi.hoisted(() => ({
  fields: new Map<string, Field>(), resets: [] as Array<() => void>,
  states: [] as unknown[], effects: [] as Array<() => void | (() => void)>, api: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial);
      return [initial === "screen" ? "imagegen" : value, (next: unknown) => { events.states.push(next); setValue(next); }];
    },
    useEffect: (effect: () => void | (() => void)) => { events.effects.push(effect); },
  };
});
vi.mock("../../src/ui/components/ui/textarea", () => ({ Textarea: (props: Field) => {
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

const defaults = { topic: DEFAULT_CAROUSEL_TOPIC_PROMPT, video: DEFAULT_CAROUSEL_VIDEO_PROMPT };
const cases = [["topic", "캐러셀 기획 프롬프트 · 주제로", 0], ["video", "캐러셀 기획 프롬프트 · 영상으로", 1]] as const;
const endpoint = "/api/system/carousel-prompts";
const responseOf = (values = defaults) => ({ topic: { prompt: values.topic, isDefault: values.topic === defaults.topic }, video: { prompt: values.video, isDefault: values.video === defaults.video } });
const render = () => renderToStaticMarkup(<Settings onSnackbar={() => undefined} onError={() => undefined} update={null} onCheckUpdate={() => undefined} />);

beforeEach(() => {
  events.api.mockReset(); events.fields.clear(); events.resets.length = 0; events.states.length = 0; events.effects.length = 0;
});

describe("캐러셀 기획 프롬프트 설정", () => {
  it("마운트할 때 저장된 두 프롬프트를 읽어 반영한다", async () => {
    const saved = { topic: "저장된 주제 지침", video: "저장된 영상 지침" };
    events.api.mockImplementation(async (_method, path) => {
      if (path === endpoint) return responseOf(saved);
      throw new Error("이 테스트에서 사용하지 않는 설정");
    });
    render();
    events.effects[0]!();
    await vi.waitFor(() => expect(events.states).toContainEqual(saved));
    expect(events.api).toHaveBeenCalledWith("GET", endpoint);
  });

  it.each(cases)("%s는 기본 본문을 표시하고 blur에서 해당 값만 저장한다", async (kind, label) => {
    events.api.mockImplementation(async (_method, _path, body) => responseOf({ ...defaults, ...body }));
    render();
    const field = events.fields.get(label)!;
    expect(field).toBeDefined();
    expect(field.value).toBe(defaults[kind]);
    expect(field.maxLength).toBe(CAROUSEL_PROMPT_MAX_LENGTH);
    expect(field.className).toBe("h-28 text-xs");
    expect(field.placeholder).toBeUndefined();
    field.onChange({ target: { value: "직접 쓴 기획 지침" } });
    expect(events.api).not.toHaveBeenCalled();
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledOnce());
    expect(events.api).toHaveBeenCalledWith("PUT", endpoint, { [kind]: "직접 쓴 기획 지침" });
  });

  it.each(cases)("%s 저장 중 기본값으로 바꾸면 마지막 요청도 기본값이다", async (kind, label, resetIndex) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, _path, body) => { await gate; return responseOf({ ...defaults, ...body }); });
    render();
    const field = events.fields.get(label)!;
    expect(field).toBeDefined();
    field.onChange({ target: { value: "직접 쓴 기획 지침" } });
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledOnce());
    events.resets[resetIndex]!();
    finish();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(2));
    expect(events.api).toHaveBeenLastCalledWith("PUT", endpoint, { [kind]: defaults[kind] });
    expect(events.states.at(-1)).not.toEqual({ ...defaults, [kind]: "직접 쓴 기획 지침" });
  });

  it.each(cases)("%s 저장 응답의 공백 제거 값을 상태와 다음 저장에 반영한다", async (kind, label) => {
    events.api.mockResolvedValue(responseOf({ ...defaults, [kind]: "정리된 지침" }));
    render();
    const field = events.fields.get(label)!;
    expect(field).toBeDefined();
    field.onChange({ target: { value: "  정리된 지침  " } });
    field.onBlur();
    await vi.waitFor(() => expect(events.states).toContainEqual({ ...defaults, [kind]: "정리된 지침" }));
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(2));
    expect(events.api).toHaveBeenLastCalledWith("PUT", endpoint, { [kind]: "정리된 지침" });
  });

  it.each(cases)("%s의 이전 저장 응답은 새 편집 값을 덮어쓰지 않는다", async (kind, label) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, _path, body) => { await gate; return responseOf({ ...defaults, [kind]: body[kind].trim() }); });
    render();
    const field = events.fields.get(label)!;
    expect(field).toBeDefined();
    field.onChange({ target: { value: "  이전 지침  " } });
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledOnce());
    field.onChange({ target: { value: "새 지침" } });
    finish();
    field.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(2));
    expect(events.api).toHaveBeenLastCalledWith("PUT", endpoint, { [kind]: "새 지침" });
    expect(events.states).not.toContainEqual({ ...defaults, [kind]: "이전 지침" });
  });

  it("주제 저장 응답은 편집 중인 영상 프롬프트를 보존한다", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    events.api.mockImplementation(async (_method, _path, body) => { await gate; return responseOf({ ...defaults, ...body }); });
    render();
    const topic = events.fields.get(cases[0][1])!;
    const video = events.fields.get(cases[1][1])!;
    expect(topic).toBeDefined(); expect(video).toBeDefined();
    topic.onChange({ target: { value: "주제 수정" } }); topic.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledOnce());
    video.onChange({ target: { value: "영상 수정" } });
    finish(); video.onBlur();
    await vi.waitFor(() => expect(events.api).toHaveBeenCalledTimes(2));
    expect(events.api).toHaveBeenLastCalledWith("PUT", endpoint, { video: "영상 수정" });
  });
});
