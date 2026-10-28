import { useLayoutEffect, useRef, useState } from "react";
import type { CarouselSlide } from "../../../core/carousel";
import { carouselCanvasSize, textObjectStyle, type CarouselAspect } from "../../../remotion/carousel-layout";
import { ensureFonts } from "../../../remotion/fonts";

export function textOverflowsCanvas(rect: { left: number; top: number; width: number; height: number }, canvas: { width: number; height: number }) {
  return rect.left < -0.5 || rect.top < -0.5 || rect.left + rect.width > canvas.width + 0.5 || rect.top + rect.height > canvas.height + 0.5;
}
export function CarouselOverflowNotice({ count }: { count: number }) {
  return count > 0 ? <p role="status" className="text-xs text-destructive">넘친 글이 있는 장 {count}개</p> : null;
}
export type OverflowMap = Record<string, string[]>;

/** 모든 장의 실제 줄바꿈을 합성과 같은 크기로 측정한다. 숨김 상태에서도 레이아웃은 유지한다. */
export function CarouselOverflowMeasure({ slides, aspect, onMeasure }: { slides: CarouselSlide[]; aspect: CarouselAspect; onMeasure: (map: OverflowMap) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onMeasure);
  callback.current = onMeasure;
  const canvas = carouselCanvasSize(aspect);
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      if (!live || !ref.current) return;
      const result: OverflowMap = {};
      for (const node of ref.current.querySelectorAll<HTMLElement>("[data-measure-text]")) {
        const rect = node.getBoundingClientRect();
        const parent = node.parentElement!.getBoundingClientRect();
        if (textOverflowsCanvas({ left: rect.left - parent.left, top: rect.top - parent.top, width: Math.max(rect.width, node.scrollWidth), height: Math.max(rect.height, node.scrollHeight) }, canvas)) (result[node.dataset.slide!] ??= []).push(node.dataset.measureText!);
      }
      callback.current(result);
    };
    measure();
    void ensureFonts().then(() => document.fonts.ready).then(measure);
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    return () => { live = false; observer.disconnect(); };
  }, [slides, aspect]);
  return <div ref={ref} aria-hidden="true" className="carousel-player pointer-events-none invisible fixed top-0 -left-[10000px]" style={{ width: canvas.width }}>{slides.map(slide => <div key={slide.id} style={{ position: "relative", width: canvas.width, height: canvas.height }}>{slide.texts.map(text => <div data-slide={slide.id} data-measure-text={text.id} key={text.id} style={textObjectStyle(text, canvas)}>{text.text}</div>)}</div>)}</div>;
}

export function useOverflowMap() {
  const [map, setMap] = useState<OverflowMap>({});
  const update = (next: OverflowMap) => setMap(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  return { map, update };
}
