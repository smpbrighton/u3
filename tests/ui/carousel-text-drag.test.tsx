import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Carousel, newSlide } from "../../src/core/carousel";
import { CarouselEdit } from "../../src/ui/screens/carousel/CarouselEdit";
import { CarouselTextLayer } from "../../src/ui/screens/carousel/CarouselTextLayer";
import { api } from "../../src/ui/api";

// DOM 대신 pointer 경계와 hook 수명만 제공한다. 편집 화면의 실제 저장 핸들러를 실행한다.
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useEffect: () => undefined, useLayoutEffect: () => undefined,
    useState: (value: unknown) => [typeof value === "function" ? value() : value, vi.fn()],
    useRef: (value: unknown) => ({ current: value }) };
});
vi.mock("../../src/ui/api", () => ({ api: vi.fn(), carouselFileUrl: vi.fn() }));
vi.mock("../../src/remotion/CarouselSlide", () => ({ CarouselSlide: () => null }));
vi.mock("../../src/ui/update-save", () => ({ useBeforeUpdateRestart: () => undefined }));
vi.mock("@remotion/player", () => ({ Player: () => null }));

type Element = React.ReactElement<Record<string, unknown>>;
function find(node: React.ReactNode, type: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  return node.type === type ? node : find(node.props.children as React.ReactNode, type);
}
function fixture() {
  return Carousel.parse({ id: "drag", name: "글 이동", source: { kind: "topic" }, topic: "주제", aspect: "4:5", stage: "images",
    createdAt: "2026-10-28T00:00:00Z", savedAt: "2026-10-28T00:00:00Z",
    slides: [newSlide({ kind: "topic" }, "4:5"), { ...newSlide({ kind: "topic" }, "4:5"), id: "slide-2" }] });
}
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue(fixture()); });

describe("미리보기 글 객체와 PATCH 연결", () => {
  it("끌어 옮기면 선택한 객체의 x·y만 바꿔 저장한다", async () => {
    const onUpdate = vi.fn(), onError = vi.fn();
    const tree = CarouselEdit({ carousel: fixture(), jobs: [], onBack: vi.fn(), onUpdate, onSnackbar: vi.fn(), onError });
    const layerProps = find(tree, CarouselTextLayer)!.props as Parameters<typeof CarouselTextLayer>[0];
    const layer = CarouselTextLayer(layerProps);
    const root = layer.props;
    root.ref.current = { getBoundingClientRect: () => ({ width: 540, height: 675 }) };
    const text = root.children.props.children[0];
    const pointer = { button: 0, clientX: 100, clientY: 100, pointerId: 1, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { focus: vi.fn(), setPointerCapture: vi.fn() } };
    text.props.onPointerDown(pointer);
    root.onPointerMove({ ...pointer, clientX: 154, clientY: 235 });
    expect(api).not.toHaveBeenCalled();
    root.onPointerUp({ ...pointer, clientX: 154, clientY: 235 });
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("PATCH", "/api/carousels/drag/slides/slide-1", {
      texts: [{ ...fixture().slides[0]!.texts[0]!, x: 0.18, y: 0.29 }, fixture().slides[0]!.texts[1]!],
    }));
    expect(onError).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalled();
  });

  it("방향키는 글 객체를 1% 옮기고 입력 칸에 전역 핸들러를 붙이지 않는다", () => {
    const onChange = vi.fn(), onSelect = vi.fn();
    const texts = fixture().slides[0]!.texts;
    const layer = CarouselTextLayer({ texts, aspect: "4:5", selectedId: "title", overflow: [], onChange, onSelect });
    const text = layer.props.children.props.children[0];
    const preventDefault = vi.fn();
    text.props.onKeyDown({ key: "ArrowRight", preventDefault, stopPropagation: vi.fn() });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...texts[0], x: 0.09 }, true);
    expect(preventDefault).toHaveBeenCalled();
  });
});
