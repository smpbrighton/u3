import { CAPTION_HIGHLIGHT_DEFAULT, captionLayersOf, withCaptionLayers, type CaptionLayer, type CaptionClipStyle, type TextClip, type Timeline } from "../../core/schema";
import { Button } from "../components/ui/button";
import { PropertySection } from "../components/u3/PropertySection";
import { PropertyRow } from "../components/u3/PropertyRow";
import { ColorRow, RangeRow, StudioSelect } from "../components/u3/StudioControls";

export function updateCaption(timeline: Timeline, id: string, changes: Partial<TextClip>): Timeline {
  return withCaptionLayers(timeline, captionLayersOf(timeline).map(layer => ({ ...layer,
    main: layer.main.map(c => c.id === id ? { ...c, ...changes } : c),
    sub: layer.sub.map(c => c.id === id ? { ...c, ...changes } : c),
  })));
}
export function CaptionStyleEditor(p: { timeline: Timeline; clip: TextClip; layer: CaptionLayer; onChange: (timeline: Timeline) => void }) {
  const style = p.clip.style ?? {};
  const change = (patch: Partial<CaptionClipStyle>) => p.onChange(updateCaption(p.timeline, p.clip.id, { style: { ...style, ...patch } }));
  return <PropertySection title="이 자막 스타일" defaultOpen={false}>
    <ColorRow label="글자 색" value={style.color ?? p.layer.style.color} onChange={color => change({ color })} />
    <RangeRow label="크기" display={`${Math.round((style.sizeScale ?? 1) * 100)}%`} value={style.sizeScale ?? 1} min={0.5} max={2} step={0.01} onChange={sizeScale => change({ sizeScale })} />
    <PropertyRow label="등장 효과"><StudioSelect label="등장 효과" value={style.animation ?? "none"} items={[{ value: "none", label: "없음" }, { value: "pop", label: "튀어나옴" }, { value: "rise", label: "떠오름" }, { value: "shake", label: "흔들림" }]} onChange={animation => change({ animation: animation as CaptionClipStyle["animation"] })} /></PropertyRow>
    <ColorRow label="단어 색" value={style.highlightColor ?? CAPTION_HIGHLIGHT_DEFAULT} onChange={highlightColor => change({ highlightColor })} />
    <Button variant="outline" size="sm" className="mt-2 w-full" disabled={!p.clip.style} onClick={() => p.onChange(updateCaption(p.timeline, p.clip.id, { style: undefined }))}>레이어 스타일로 되돌리기</Button>
  </PropertySection>;
}
