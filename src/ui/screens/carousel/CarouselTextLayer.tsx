import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { CarouselTextObject } from "../../../core/carousel";
import { carouselCanvasSize, textObjectStyle, type CarouselAspect } from "../../../remotion/carousel-layout";
import { transformText } from "./text-geometry";
import { textRoleName } from "./CarouselTextInspector";

export function CarouselTextLayer(props: {
  texts: CarouselTextObject[]; aspect: CarouselAspect; selectedId: string | null; overflow: string[];
  onSelect: (id: string) => void; onChange: (text: CarouselTextObject, commit: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const canvas = carouselCanvasSize(props.aspect);
  const drag = useRef<{ text: CarouselTextObject; x: number; y: number; resize: boolean; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setScale(node.getBoundingClientRect().width / canvas.width);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [canvas.width]);
  function start(event: PointerEvent<HTMLElement>, text: CarouselTextObject, resize: boolean) {
    if (event.button !== 0 || !ref.current) return;
    event.preventDefault(); event.stopPropagation(); props.onSelect(text.id);
    event.currentTarget.focus();
    const rect = ref.current.getBoundingClientRect();
    drag.current = { text, x: event.clientX, y: event.clientY, resize, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>, commit: boolean) {
    const current = drag.current;
    if (!current || !current.width || !current.height) return;
    props.onChange(transformText(current.text, (event.clientX - current.x) / current.width, (event.clientY - current.y) / current.height, current.resize), commit);
    if (commit) drag.current = null;
  }
  return <div ref={ref} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" onPointerMove={e => move(e, false)} onPointerUp={e => move(e, true)} onPointerCancel={() => { const current = drag.current; if (current) props.onChange(current.text, true); drag.current = null; }}>
    <div style={{ position: "absolute", width: canvas.width, height: canvas.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {props.texts.map(text => <div key={text.id} role="button" tabIndex={0} aria-label={`${textRoleName(text)} 선택`} aria-pressed={text.id === props.selectedId} className={`pointer-events-auto cursor-move touch-none outline-2 -outline-offset-2 ${props.overflow.includes(text.id) ? "outline-destructive" : text.id === props.selectedId ? "outline-primary" : "outline-transparent focus-visible:outline-ring"}`} style={{ ...textObjectStyle(text, canvas), color: "transparent", opacity: 1, background: "transparent", WebkitTextStroke: "none", textShadow: "none", minHeight: text.fontSize * 1.18 }} onFocus={() => props.onSelect(text.id)} onPointerDown={e => start(e, text, false)} onKeyDown={event => {
        const step: Record<string, [number, number]> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] };
        const delta = step[event.key]; if (!delta) return;
        event.preventDefault(); event.stopPropagation(); props.onChange(transformText(text, delta[0], delta[1], false), true);
      }}>{text.text || "\u00a0"}{text.id === props.selectedId && <button type="button" aria-label="글 폭 조절" title="글 폭 조절" className="absolute top-0 right-0 h-full w-4 cursor-ew-resize border-0 bg-transparent outline-none focus-visible:bg-primary/20" onPointerDown={e => start(e, text, true)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); props.onChange(transformText(text, event.key === "ArrowLeft" ? -0.01 : 0.01, 0, true), true);
      }} />}</div>)}
    </div>
  </div>;
}
