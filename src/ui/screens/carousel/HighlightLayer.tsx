import { useRef, type PointerEvent } from "react";
import type { CarouselBox } from "../../../core/carousel";

export function HighlightLayer(props: { box: CarouselBox; selected: boolean; onSelect: () => void; onChange: (box: CarouselBox, commit: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ box: CarouselBox; x: number; y: number; resize: boolean; width: number; height: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  function start(event: PointerEvent<HTMLElement>, resize: boolean) {
    if (!ref.current || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); props.onSelect(); event.currentTarget.focus();
    const rect = ref.current.getBoundingClientRect();
    drag.current = { box: props.box, x: event.clientX, y: event.clientY, resize, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent, commit: boolean) {
    const current = drag.current; if (!current || !current.width || !current.height) return;
    const dx = (event.clientX - current.x) / current.width, dy = (event.clientY - current.y) / current.height;
    const b = current.box, width = b.right - b.left, height = b.bottom - b.top;
    const factor = clamp(1 + dx / width, Math.max(0.05 / width, 0.05 / height), Math.min((1 - b.left) / width, (1 - b.top) / height));
    const left = clamp(b.left + dx, 0, 1 - width), top = clamp(b.top + dy, 0, 1 - height);
    props.onChange(current.resize ? { ...b, right: b.left + width * factor, bottom: b.top + height * factor } : { left, top, right: left + width, bottom: top + height }, commit);
    if (commit) drag.current = null;
  }
  const b = props.box;
  return <div ref={ref} className="pointer-events-none absolute inset-0 z-10" onPointerMove={e => move(e, false)} onPointerUp={e => move(e, true)} onPointerCancel={() => { if (drag.current) props.onChange(drag.current.box, true); drag.current = null; }}>
    <div tabIndex={0} role="button" aria-label="강조 상자 선택" aria-pressed={props.selected} className={`pointer-events-auto absolute cursor-move touch-none border-2 outline-none ${props.selected ? "border-primary" : "border-ring focus-visible:border-primary"}`} style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, width: `${(b.right - b.left) * 100}%`, height: `${(b.bottom - b.top) * 100}%` }} onPointerDown={e => start(e, false)} onFocus={props.onSelect} onKeyDown={event => {
      const delta = ({ ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] } as Record<string, number[]>)[event.key];
      if (!delta) return; event.preventDefault(); event.stopPropagation();
      const dx = clamp(delta[0]!, -b.left, 1 - b.right), dy = clamp(delta[1]!, -b.top, 1 - b.bottom);
      props.onChange({ left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy }, true);
    }}>{props.selected && <button type="button" aria-label="강조 상자 크기 조절" title="상자 크기 조절" className="absolute -right-1 -bottom-1 size-3 cursor-nwse-resize border border-primary bg-background" onPointerDown={e => start(e, true)} />}</div>
  </div>;
}
