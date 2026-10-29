import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline as TimelineEditor, type TimelineState } from "@xzdarcy/react-timeline-editor";
import { Timeline as TimelineData, captionLayersOf } from "../../src/core/schema";
import { Timeline } from "../../src/ui/studio/Timeline";

const view = vi.hoisted(() => ({ hooks: [] as unknown[], cursor: 0 }));
// DOM 경계와 hook 수명만 대체하고 실제 Timeline 이벤트와 편집 함수를 실행한다.
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useEffect: () => undefined, useMemo: (create: () => unknown) => create(),
    useState: (initial: unknown) => {
      const i = view.cursor++;
      if (!(i in view.hooks)) view.hooks[i] = typeof initial === "function" ? initial() : initial;
      return [view.hooks[i], (next: unknown) => { view.hooks[i] = typeof next === "function" ? next(view.hooks[i]) : next; }];
    },
    useRef: (initial: unknown) => {
      const i = view.cursor++;
      if (!(i in view.hooks)) view.hooks[i] = { current: initial };
      return view.hooks[i];
    },
  };
});
vi.mock("@xzdarcy/react-timeline-editor", () => ({ Timeline: () => null }));
vi.mock("../../src/ui/api", () => ({ api: vi.fn() }));

type Element = React.ReactElement<Record<string, unknown>>;
type EditorProps = React.ComponentProps<typeof TimelineEditor>;
function find(node: React.ReactNode, matches: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, matches)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  return matches(node) ? node : find(node.props.children as React.ReactNode, matches);
}

function setup() {
  const timeline = TimelineData.parse({
    video: [{ id: "v", kind: "main", inputId: "in", durationSec: 10 }],
    captions: [{ id: "c", startSec: 2, endSec: 3, text: "말" }],
    voice: [{ id: "voice", startSec: 2, file: "v.wav", inStartSec: 1.5, inEndSec: 4.5, gain: 1, speed: 1.5 }],
    sfx: [{ id: "sfx", startSec: 2, file: "s.wav", inStartSec: 1, inEndSec: 4, gain: 1, lane: 1 }],
    audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
  });
  const onEdit = vi.fn(), onError = vi.fn();
  const props: React.ComponentProps<typeof Timeline> = {
    timeline, playhead: 0, zoom: 4, snap: true, selectedId: null, selectedIds: [],
    audioDurations: { "v.wav": 6, "s.wav": 6 }, onSelect: vi.fn(), onPlayhead: vi.fn(), onEdit, onError,
  };
  const draw = () => {
    view.cursor = 0;
    const tree = Timeline(props);
    return {
      editor: find(tree, node => node.type === TimelineEditor)! as unknown as React.ReactElement<EditorProps>,
      host: find(tree, node => node.props.className === "studio-timeline-editor")!,
    };
  };
  const initial = draw();
  const resize = (id: string, rowId: string, dir: "left" | "right", start: number, end: number) => {
    const editor = draw().editor.props;
    const row = editor.editorData.find(row => row.id === rowId)!;
    const action = row.actions.find(action => action.id === id)!;
    editor.onActionResizeEnd!({ action: { ...action, start, end }, row, dir, start, end });
  };
  return { props, onEdit, onError, draw, resize, initial };
}

beforeEach(() => {
  view.hooks.length = 0; view.cursor = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
});
afterEach(() => vi.unstubAllGlobals());

describe("058 Timeline 크기 조절", () => {
  it.each(["captions", "layer-main", "layer-sub"])("%s 자막 줄은 끝을 늘린다", row => {
    const v = setup();
    if (row !== "captions") {
      const layer = captionLayersOf(v.props.timeline)[0]!;
      if (row === "layer-sub") { layer.sub = layer.main; layer.main = []; }
      row = `${layer.id}-${row.endsWith("sub") ? "sub" : "main"}`;
    } else delete v.props.timeline.captionLayers;
    v.resize("c", row, "right", 2, 5);
    expect(v.onError.mock.calls).toEqual([]);
    expect(v.onEdit).toHaveBeenCalledOnce();
    const next = v.onEdit.mock.calls[0]![0] as TimelineData;
    expect(captionLayersOf(next).flatMap(layer => [...layer.main, ...layer.sub]).find(c => c.id === "c")).toMatchObject({ startSec: 2, endSec: 5 });
  });

  it.each([
    ["voice", "voice", "right", 2, 20, 2, 1.5, 6],
    ["voice", "voice", "left", -10, 4, 1, 0, 4.5],
    ["sfx", "sfx-2", "right", 2, 20, 2, 1, 6],
    ["sfx", "sfx-2", "left", -10, 5, 1, 0, 4],
  ] as const)("%s 클립의 %s 줄에서 %s 조절은 파일 경계에서 멈춘다", (id, row, dir, start, end, startSec, inStartSec, inEndSec) => {
    const v = setup();
    v.resize(id, row, dir, start, end);
    expect(v.onError.mock.calls).toEqual([]);
    expect(v.onEdit).toHaveBeenCalledOnce();
    const next = v.onEdit.mock.calls[0]![0] as TimelineData;
    expect([...next.voice, ...next.sfx].find(c => c.id === id)).toMatchObject({ startSec, inStartSec, inEndSec });
  });

  it("트림 오류는 onError를 부르고 편집기 key를 바꾸며 스크롤을 복원한다", () => {
    const v = setup();
    const scroll = { setScrollLeft: vi.fn(), setScrollTop: vi.fn() };
    (v.initial.editor.props.ref as React.RefObject<TimelineState>).current = scroll as unknown as TimelineState;
    (v.initial.host.props.ref as React.RefObject<unknown>).current = {
      querySelector: (selector: string) => selector.includes("time-area") ? { scrollLeft: 240 } : { scrollTop: 84 },
    };
    v.resize("v", "video", "right", 0, 0);
    expect(v.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("트림 결과 길이"));
    expect(v.onEdit).not.toHaveBeenCalled();
    expect(v.draw().editor.key).not.toBe(v.initial.editor.key);
    const callback = vi.mocked(requestAnimationFrame).mock.calls[0]![0];
    callback(0);
    expect(scroll.setScrollLeft).toHaveBeenCalledExactlyOnceWith(240);
    expect(scroll.setScrollTop).toHaveBeenCalledExactlyOnceWith(84);
  });

  it("오디오의 0프레임 트림 오류도 편집기를 복원한다", () => {
    const v = setup();
    v.resize("voice", "voice", "right", 2, 2.001);
    expect(v.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("1프레임"));
    expect(v.onEdit).not.toHaveBeenCalled();
    expect(v.draw().editor.key).not.toBe(v.initial.editor.key);
  });

  it("자막 경계에서 변경이 없으면 편집기만 복원한다", () => {
    const v = setup();
    v.resize("c", `${captionLayersOf(v.props.timeline)[0]!.id}-main`, "right", 2, 3);
    expect(v.onError.mock.calls).toEqual([]);
    expect(v.onEdit).not.toHaveBeenCalled();
    expect(v.draw().editor.key).not.toBe(v.initial.editor.key);
  });
});
