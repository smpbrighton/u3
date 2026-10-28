import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline as TimelineEditor } from "@xzdarcy/react-timeline-editor";
import { Timeline } from "../../src/ui/studio/Timeline";

// 기존 UI 테스트처럼 DOM 경계와 hook 수명만 대체하고 실제 이벤트 핸들러를 실행한다.
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useEffect: () => undefined,
    useMemo: (create: () => unknown) => create(),
    useState: (value: unknown) => [typeof value === "function" ? value() : value, vi.fn()],
    useRef: (value: unknown) => ({ current: value }) };
});
vi.mock("@xzdarcy/react-timeline-editor", () => ({ Timeline: () => null }));
vi.mock("../../src/ui/api", () => ({ api: vi.fn() }));

class FocusElement {
  constructor(readonly tagName: string, readonly role: string | null = null) {}
  focus() { focusDocument.activeElement = this; }
  blur() { if (focusDocument.activeElement === this) focusDocument.activeElement = focusDocument.body; }
  matches(selector: string) {
    return selector.split(",").some(part => {
      const value = part.trim();
      const role = value.match(/^\[role=["']?([\w-]+)["']?\]$/);
      return role ? this.role === role[1] : this.tagName.toLowerCase() === value.toLowerCase();
    });
  }
}
const body = new FocusElement("BODY");
const focusDocument = { body, activeElement: body };

type Element = React.ReactElement<Record<string, unknown>>;
function find(node: React.ReactNode, matches: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, matches)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  return matches(node) ? node : find(node.props.children as React.ReactNode, matches);
}

function renderTimeline() {
  const onSelect = vi.fn(), onPlayhead = vi.fn();
  const tree = Timeline({
    timeline: {
      video: [{ id: "main", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 3 }],
      overlays: [], captions: [], voice: [], sfx: [],
      audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
    },
    playhead: 0, zoom: 4, snap: true, selectedId: null, selectedIds: [],
    onSelect, onPlayhead, onEdit: vi.fn(), onError: vi.fn(),
  });
  const editor = find(tree, node => node.type === TimelineEditor)!.props as unknown as React.ComponentProps<typeof TimelineEditor>;
  const host = find(tree, node => node.props.className === "studio-timeline-editor")!.props as React.ComponentProps<"div">;
  return { editor, host, onSelect, onPlayhead };
}

beforeEach(() => {
  focusDocument.activeElement = body;
  vi.stubGlobal("document", focusDocument);
  vi.stubGlobal("HTMLElement", FocusElement);
});
afterEach(() => vi.unstubAllGlobals());

const controls = [["BUTTON", null], ["DIV", "button"], ["BUTTON", "tab"], ["DIV", "tab"]] as const;

describe("타임라인 클릭의 버튼·탭 포커스 해제", () => {
  it.each(controls)("클립 클릭은 %s role=%s 포커스를 해제하고 클립을 선택한다", (tag, role) => {
    const { editor, onSelect } = renderTimeline();
    const button = new FocusElement(tag, role);
    button.focus();
    const event = { stopPropagation: vi.fn(), shiftKey: true } as unknown as React.MouseEvent<HTMLElement>;
    editor.onClickAction!(event, { action: { id: "main", start: 0, end: 3, effectId: "main" }, row: { id: "video", actions: [] }, time: 1 });
    expect(document.activeElement === document.body).toBe(true);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("main", "video", true);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it.each(controls)("시간 눈금 클릭은 %s role=%s 포커스를 해제하고 재생 위치를 바꾼다", (tag, role) => {
    const { editor, onPlayhead } = renderTimeline();
    new FocusElement(tag, role).focus();
    expect(editor.onClickTimeArea!(1.5, {} as React.MouseEvent<HTMLDivElement>)).toBe(true);
    expect(document.activeElement === document.body).toBe(true);
    expect(onPlayhead).toHaveBeenCalledExactlyOnceWith(1.5);
  });

  it.each(controls)("타임라인 빈 곳의 pointerdown은 %s role=%s 포커스를 해제한다", (tag, role) => {
    const { host } = renderTimeline();
    new FocusElement(tag, role).focus();
    host.onPointerDown?.({} as React.PointerEvent<HTMLDivElement>);
    expect(document.activeElement === document.body).toBe(true);
  });

  it.each([["INPUT", null], ["TEXTAREA", null], ["DIV", "textbox"], ["DIV", "switch"]] as const)("%s role=%s 포커스는 강제로 해제하지 않는다", (tag, role) => {
    const { editor, host } = renderTimeline();
    const input = new FocusElement(tag, role) as unknown as HTMLElement;
    input.focus();
    host.onPointerDown?.({} as React.PointerEvent<HTMLDivElement>);
    expect(document.activeElement === input).toBe(true);
    editor.onClickTimeArea!(1, {} as React.MouseEvent<HTMLDivElement>);
    expect(document.activeElement === input).toBe(true);
    editor.onClickAction!({ stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLElement>, { action: { id: "main", start: 0, end: 3, effectId: "main" }, row: { id: "video", actions: [] }, time: 1 });
    expect(document.activeElement === input).toBe(true);
  });
});
