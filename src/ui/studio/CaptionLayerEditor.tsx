import { useState } from "react";
import type { CaptionLayer, Project, Timeline } from "../../core/schema";
import { addCaptionLayer, deleteCaptionLayer, replaceCaptionSubtitles, swapCaptionRows } from "../../core/caption-layers";
import { captionLayersOf, withCaptionLayers } from "../../core/schema";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import { PropertyRow } from "../components/u3/PropertyRow";
import { StudioSelect, StudioTextInput, RangeRow, SwitchRow, ColorRow } from "../components/u3/StudioControls";
import { api } from "../api";

export function CaptionLayerEditor(p: { project: Project; timeline: Timeline; layer: CaptionLayer; onChange: (timeline: Timeline) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (changes: Partial<CaptionLayer> | { style: Partial<CaptionLayer["style"]> }) => {
    const next = { ...p.layer, ...changes, style: "style" in changes ? { ...p.layer.style, ...changes.style } : p.layer.style };
    p.onChange(withCaptionLayers(p.timeline, captionLayersOf(p.timeline).map(l => l.id === p.layer.id ? next : l)));
  };
  const style = p.layer.style;
  async function translate() {
    setBusy(true); setError(null);
    try { await api("PUT", `/api/projects/${p.project.id}`, { ...p.project, timeline: p.timeline }); const result = await api<{ captions: { id: string; text: string }[] }>("POST", `/api/projects/${p.project.id}/captions/translate`, { layerId: p.layer.id }); p.onChange(replaceCaptionSubtitles(p.timeline, p.layer.id, result.captions)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-1">
    <PropertyRow label="이름"><StudioTextInput label="레이어 이름" value={p.layer.name} onChange={name => update({ name: name || "자막" })} /></PropertyRow>
    <PropertyRow label="폰트"><StudioSelect label="폰트" value={style.font} items={[{ value: "pretendard", label: "Pretendard" }, { value: "gmarket", label: "G마켓 산스" }, { value: "tmon", label: "티몬체" }]} onChange={font => update({ style: { font: font as CaptionLayer["style"]["font"] } })} /></PropertyRow>
    <RangeRow label="메인 크기" display={String(style.mainSize)} min={20} max={100} step={1} value={style.mainSize} onChange={mainSize => update({ style: { mainSize } })} />
    <RangeRow label="서브 크기" display={String(style.subSize)} min={16} max={80} step={1} value={style.subSize} onChange={subSize => update({ style: { subSize } })} />
    <ColorRow label="글자 색" value={style.color} onChange={color => update({ style: { color } })} />
    <RangeRow label="글자 투명도" display={`${Math.round(style.textOpacity * 100)}%`} min={0} max={1} step={0.01} value={style.textOpacity} onChange={textOpacity => update({ style: { textOpacity } })} />
    <RangeRow label="가로 위치" display={`${Math.round(p.layer.x * 100)}%`} min={0} max={1} step={0.01} value={p.layer.x} onChange={x => update({ x })} />
    <RangeRow label="세로 위치" display={`${Math.round(p.layer.y * 100)}%`} min={0} max={1} step={0.01} value={p.layer.y} onChange={y => update({ y })} />
    <RangeRow label="투명도" display={`${Math.round((p.layer.opacity ?? 1) * 100)}%`} min={0} max={1} step={0.01} value={p.layer.opacity ?? 1} onChange={opacity => update({ opacity })} />
    <SwitchRow label="자막바" checked={style.bar} onChange={bar => update({ style: { bar } })} />
    {style.bar && <><ColorRow label="자막바 색" value={style.barColor} onChange={barColor => update({ style: { barColor } })} /><RangeRow label="자막바 투명도" display={`${Math.round(style.barOpacity * 100)}%`} min={0} max={1} step={0.01} value={style.barOpacity} onChange={barOpacity => update({ style: { barOpacity } })} /></>}
    <div className="mt-2 grid grid-cols-2 gap-1.5"><Button size="xs" variant="outline" onClick={() => p.onChange(withCaptionLayers(p.timeline, captionLayersOf(p.timeline).map(l => l.id === p.layer.id ? swapCaptionRows(l) : l)))}>메인·서브 바꾸기</Button><Button size="xs" variant="outline" disabled={busy} onClick={() => void translate()}>서브 자막 만들기</Button></div>
    {busy && <div role="status" className="grid gap-2 py-2 text-xs"><span>서브 자막 만드는 중</span><Progress /></div>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="mt-2 flex gap-1.5 border-t border-border pt-2"><Button size="xs" variant="ghost" onClick={() => p.onChange(addCaptionLayer(p.timeline))}>레이어 더하기</Button><Button size="xs" variant="ghost" disabled={captionLayersOf(p.timeline).length < 2} onClick={() => p.onChange(deleteCaptionLayer(p.timeline, p.layer.id))}>레이어 지우기</Button></div>
  </div>;
}
