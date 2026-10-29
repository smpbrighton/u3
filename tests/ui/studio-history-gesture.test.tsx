import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Project } from "../../src/core/schema";
import { Studio } from "../../src/ui/screens/Studio";

type SliderProps = React.ComponentProps<typeof import("../../src/ui/components/ui/slider").Slider>;
const view = vi.hoisted(() => ({ hooks: [] as unknown[], cursor: 0, sliders: new Map<string, SliderProps>(), buttons: new Map<string, React.ComponentProps<"button">>() }));
// DOM 경계만 대체한다. 실제 Studio의 edit·undo·redo와 StudioSlider 이벤트를 실행한다.
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useEffect: () => {},
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
vi.mock("../../src/ui/components/ui/slider", () => ({ Slider: (p: SliderProps) => { view.sliders.set(String(p["aria-label"]), p); return null; } }));
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (p: React.ComponentProps<"button">) => { view.buttons.set(String(p["aria-label"]), p); return null; } }));
vi.mock("../../src/ui/components/ui/switch", () => ({ Switch: () => null }));
vi.mock("../../src/ui/components/u3/BusyButton", () => ({ BusyButton: () => null }));
vi.mock("../../src/ui/studio/Preview", () => ({ Preview: () => null }));
vi.mock("../../src/ui/studio/Timeline", () => ({ Timeline: () => null }));
vi.mock("../../src/ui/studio/LibraryPanel", () => ({ LibraryPanel: () => null }));
vi.mock("../../src/ui/screens/carousel/DerivedCarouselDialog", () => ({ DerivedCarouselDialog: () => null }));
vi.mock("../../src/ui/ExportDialog", () => ({ ExportDialog: () => null }));
vi.mock("../../src/ui/studio/ShortcutList", () => ({ ShortcutList: () => null }));
vi.mock("radix-ui", async original => ({ ...await original<typeof import("radix-ui")>(), Popover: { Root: () => null } }));
vi.mock("../../src/ui/studio/Inspector", async () => {
  const { StudioSlider } = await import("../../src/ui/components/u3/StudioControls");
  return { Inspector: ({ timeline, onChange }: React.ComponentProps<typeof import("../../src/ui/studio/Inspector").Inspector>) =>
    <StudioSlider label="시험 볼륨" min={0} max={2} step={0.01} value={timeline.audio.source.gain} onChange={gain => onChange({ ...timeline, audio: { ...timeline.audio, source: { ...timeline.audio.source, gain } } })} /> };
});

beforeEach(() => { view.hooks.length = 0; view.cursor = 0; view.sliders.clear(); view.buttons.clear(); vi.stubGlobal("navigator", { platform: "MacIntel" }); });
function setup() {
  const project = Project.parse({ id: "p", name: "영상", inputs: [{ id: "i", kind: "photo", file: "a.png" }], savedAt: "2026-10-29T00:00:00Z", timeline: { video: [], voice: [], sfx: [], audio: { source: { gain: 0.5, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } } });
  const draw = () => {
    view.cursor = 0;
    renderToStaticMarkup(<Studio project={project} onProject={vi.fn()} onBack={vi.fn()} onSnackbar={vi.fn()} onError={vi.fn()} onCarouselCreated={vi.fn()} />);
  };
  draw();
  const slider = () => view.sliders.get("시험 볼륨")!;
  const value = (v: number) => { slider().onValueChange!([v]); draw(); };
  const button = (name: string) => { [...view.buttons.entries()].find(([label]) => label.startsWith(name))![1].onClick!({} as never); draw(); };
  return { draw, slider, value, button, gain: () => slider().value![0] };
}

it("50→70 드래그는 실행 취소 한 번으로 50, 다시 실행으로 70이 된다", () => {
  const v = setup();
  v.slider().onPointerDown?.({} as never);
  for (let n = 51; n <= 70; n++) v.value(n / 100);
  v.slider().onValueCommit?.([0.7]);
  v.button("실행 취소"); expect(v.gain()).toBe(0.5);
  v.button("다시 실행"); expect(v.gain()).toBe(0.7);
});

it("방향키 두 번은 실행 취소 한 번으로 한 칸 전으로 간다", () => {
  const v = setup();
  v.value(0.51); v.slider().onValueCommit?.([0.51]);
  v.value(0.52); v.slider().onValueCommit?.([0.52]);
  v.button("실행 취소"); expect(v.gain()).toBe(0.51);
});

it("긴 드래그도 이전 편집을 밀어내지 않는다", () => {
  const v = setup(); v.value(0.6);
  v.slider().onPointerDown?.({} as never);
  for (let n = 61; n <= 180; n++) v.value(n / 100);
  v.slider().onValueCommit?.([1.8]);
  v.button("실행 취소"); expect(v.gain()).toBe(0.6);
  v.button("실행 취소"); expect(v.gain()).toBe(0.5);
});

it.each(["onPointerCancel", "onLostPointerCapture"] as const)("값이 바뀌지 않은 포인터 동작의 %s 뒤 키보드 편집을 묶지 않는다", event => {
  const v = setup(); v.slider().onPointerDown?.({} as never); v.slider()[event]?.({} as never);
  v.value(0.51); v.value(0.52);
  v.button("실행 취소"); expect(v.gain()).toBe(0.51);
});
