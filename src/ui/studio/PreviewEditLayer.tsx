import { useEffect, useRef, useState } from "react";
import { CANVAS, type Box } from "../../core/geometry";
import { limitBoxBelowTitleBar, moveNormalizedBox, resizeNormalizedBox, screenToNormalized, snapBoxToSafeZone, type NormalizedBox, type PreviewTarget, type ScreenRect } from "../../core/preview-geometry";

export type PreviewEditTarget = PreviewTarget & { kind: "overlay" | "caption-layer" | "watermark"; canResize: boolean; resizeProportionally?: boolean };

export function PreviewEditLayer(props: {
  targets: readonly PreviewEditTarget[];
  selectedId: string | null;
  safeZone: boolean;
  titleBarHeight?: number;
  onSelect: (id: string, kind: PreviewEditTarget["kind"]) => void;
  onPreview: (id: string, box: NormalizedBox) => void;
  onCommit: (id: string, box: NormalizedBox) => void;
  onDragStart: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; kind: PreviewEditTarget["kind"]; start: { x: number; y: number }; box: NormalizedBox; resize: boolean; resizeProportionally: boolean; paused: boolean } | null>(null);
  const [dragBox, setDragBox] = useState<{ id: string; box: NormalizedBox } | null>(null);
  const targets = props.targets;
  const activeBox = dragBox ? [dragBox] : [];

  function normalizedRect(): ScreenRect | null {
    const rect = layerRef.current?.getBoundingClientRect();
    return rect?.width && rect.height ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  }

  function updateDrag(event: React.PointerEvent<HTMLDivElement>, finish: boolean) {
    const current = drag.current;
    const rect = normalizedRect();
    if (!current || !rect) return;
    const point = screenToNormalized({ x: event.clientX, y: event.clientY }, rect);
    let box = current.resize
      ? resizeNormalizedBox(current.box, event.clientX - current.start.x, rect.width, 0.05, current.resizeProportionally)
      : moveNormalizedBox(current.box, point.x - screenToNormalized(current.start, rect).x, point.y - screenToNormalized(current.start, rect).y);
    if (props.safeZone) {
      const pixelBox: Box = { x: box.x * CANVAS.width, y: box.y * CANVAS.height, width: box.width * CANVAS.width, height: box.height * CANVAS.height };
      const snapped = snapBoxToSafeZone(pixelBox);
      box = { ...box, x: snapped.x / CANVAS.width, y: snapped.y / CANVAS.height, width: snapped.width / CANVAS.width };
    }
    if (current.kind === "caption-layer" && props.titleBarHeight) box = limitBoxBelowTitleBar(box, props.titleBarHeight);
    box = current.resize
      ? { ...box, x: Math.max(0, Math.min(1 - box.width, box.x)), y: Math.max(0, Math.min(1 - box.height, box.y)), width: Math.max(0.05, Math.min(1, box.width)) }
      : moveNormalizedBox(box, 0, 0);
    const changed = Math.abs(box.x - current.box.x) > 1e-6 || Math.abs(box.y - current.box.y) > 1e-6 || Math.abs(box.width - current.box.width) > 1e-6;
    if (changed && !current.paused) { props.onDragStart(); current.paused = true; }
    setDragBox({ id: current.id, box });
    if (changed) props.onPreview(current.id, box);
    if (finish) {
      if (changed) props.onCommit(current.id, box);
      drag.current = null;
      setDragBox(null);
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>, target: PreviewEditTarget, resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    props.onSelect(target.id, target.kind);
    drag.current = { id: target.id, kind: target.kind, start: { x: event.clientX, y: event.clientY }, box: target.box, resize, resizeProportionally: Boolean(target.resizeProportionally), paused: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!props.selectedId || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = targets.find((item) => item.id === props.selectedId);
      if (!target) return;
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? { x: -0.01, y: 0 } : event.key === "ArrowRight" ? { x: 0.01, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -0.01 } : { x: 0, y: 0.01 };
      let box = moveNormalizedBox(target.box, step.x, step.y);
      if (props.safeZone) {
        const snapped = snapBoxToSafeZone({ x: box.x * CANVAS.width, y: box.y * CANVAS.height, width: box.width * CANVAS.width, height: box.height * CANVAS.height });
        box = { ...box, x: snapped.x / CANVAS.width, y: snapped.y / CANVAS.height };
      }
      if (target.kind === "caption-layer" && props.titleBarHeight) box = limitBoxBelowTitleBar(box, props.titleBarHeight);
      props.onPreview(target.id, box);
      props.onCommit(target.id, box);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.selectedId, props.safeZone, props.titleBarHeight, props.onPreview, props.onCommit, targets]);

  return <div ref={layerRef} className="studio-preview-edit-layer" onPointerMove={(event) => updateDrag(event, false)} onPointerUp={(event) => updateDrag(event, true)} onPointerCancel={(event) => updateDrag(event, true)}>
    {props.safeZone ? <SafeZoneOverlay /> : null}
    {targets.map((target) => {
      const box = activeBox.find((item) => item.id === target.id)?.box ?? target.box;
      return <div key={target.id} className={`studio-preview-target${props.selectedId === target.id ? " is-selected" : ""}`} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} onPointerDown={(event) => onPointerDown(event, target, false)}>
        {target.canResize && props.selectedId === target.id ? <button className="studio-preview-target-resize" aria-label="폭 조절" onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event as unknown as React.PointerEvent<HTMLDivElement>, target, true); }} /> : null}
      </div>;
    })}
  </div>;
}

function SafeZoneOverlay() {
  const rightMargin = 160 / CANVAS.width;
  const normalMargin = 60 / CANVAS.width;
  return <svg className="studio-preview-safezone" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={`M0 0 H${CANVAS.width} V200 H0 Z M0 1480 H${CANVAS.width} V${CANVAS.height} H0 Z M0 200 H60 V1024 H0 Z M${CANVAS.width - 60} 200 H${CANVAS.width} V1024 H${CANVAS.width - 60} Z M0 1024 H160 V1480 H0 Z M${CANVAS.width - 160} 1024 H${CANVAS.width} V1480 H${CANVAS.width - 160} Z`} fill="rgba(0,0,0,.38)" />
    <path d={`M${normalMargin * CANVAS.width} 200 H${CANVAS.width - normalMargin * CANVAS.width} V1024 H${normalMargin * CANVAS.width} Z M${rightMargin * CANVAS.width} 1024 H${CANVAS.width - rightMargin * CANVAS.width} V1480 H${rightMargin * CANVAS.width} Z`} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="3" />
    <path d={`M0 200 H${CANVAS.width} M0 1480 H${CANVAS.width}`} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="3" />
  </svg>;
}
