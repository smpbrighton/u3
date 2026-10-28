import { useEffect, useState } from "react";
import { captionLayersOf, withCaptionLayers, type Timeline, type TextClip, type CaptionLayer } from "../../core/schema";
import { addCaptionClip, setCaptionRange, splitCaptionClip, projectDuration } from "../../core/timeline/ops";
import { plainCaptionText } from "../../core/captions";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { PropertyRow } from "../components/u3/PropertyRow";
import { StudioSelect, StudioTextarea } from "../components/u3/StudioControls";
import { CaptionStyleEditor, updateCaption } from "./CaptionStyleEditor";

export function CaptionTextFields(p: { timeline: Timeline; clip: TextClip; layer: CaptionLayer; onChange: (timeline: Timeline) => void }) {
  const paired = (row: "main" | "sub") => p.layer[row].find(c => c.id === p.clip.id || c.startSec === p.clip.startSec && c.endSec === p.clip.endSec);
  const text = (row: "main" | "sub", value: string) => {
    const c = paired(row);
    p.onChange(c ? updateCaption(p.timeline, c.id, { text: value }) : withCaptionLayers(p.timeline, captionLayersOf(p.timeline).map(l => l.id === p.layer.id ? { ...l, [row]: [...l[row], { id: `caption-${crypto.randomUUID()}`, startSec: p.clip.startSec, endSec: p.clip.endSec, text: value }].sort((a, b) => a.startSec - b.startSec) } : l)));
  };
  return <><StudioTextarea label="메인" rows={3} value={paired("main")?.text ?? ""} onChange={v => text("main", v)} /><StudioTextarea label="서브" rows={2} value={paired("sub")?.text ?? ""} onChange={v => text("sub", v)} /></>;
}

export function CaptionEditor(p: { timeline: Timeline; selectedId: string | null; playhead: number; onSelect: (id: string, track: string) => void; onSeek: (sec: number) => void; onChange: (timeline: Timeline) => void; loop: boolean; onLoopChange: (loop: boolean) => void }) {
  const layers = captionLayersOf(p.timeline);
  const [layerId, setLayerId] = useState(layers[0]?.id ?? "");
  const selectedLayer = layers.find(l => [...l.main, ...l.sub].some(c => c.id === p.selectedId));
  const layer = selectedLayer ?? layers.find(l => l.id === layerId) ?? layers[0]!;
  const entries = [...layer.main, ...layer.sub.filter(c => !layer.main.some(m => m.startSec === c.startSec && m.endSec === c.endSec))].sort((a, b) => a.startSec - b.startSec);
  const clip = [...layer.main, ...layer.sub].find(c => c.id === p.selectedId);
  const index = clip ? entries.findIndex(c => c.id === clip.id || c.startSec === clip.startSec && c.endSec === clip.endSec) : -1;
  const choose = (c: TextClip) => { p.onSelect(c.id, `${layer.id}-${layer.sub.some(s => s.id === c.id) ? "sub" : "main"}`); p.onSeek(c.startSec); };
  const row = clip && layer.sub.some(c => c.id === clip.id) ? layer.sub : layer.main;
  const lower = clip ? Math.max(0, ...row.filter(c => c.startSec < clip.startSec).map(c => c.endSec)) : 0;
  const upper = clip ? Math.min(projectDuration(p.timeline), ...row.filter(c => c.id !== clip.id && c.startSec >= clip.startSec).map(c => c.startSec)) : 0;
  const [range, setRange] = useState<number[] | null>(null);
  useEffect(() => setRange(null), [clip?.id, clip?.startSec, clip?.endSec]);
  const canAdd = p.playhead >= 0 && !layer.main.some(c => c.startSec <= p.playhead && c.endSec > p.playhead) && Math.min(3, projectDuration(p.timeline) - p.playhead, ...layer.main.filter(c => c.startSec > p.playhead).map(c => c.startSec - p.playhead)) >= 0.3 - 1e-9;
  return <div className="flex min-h-0 flex-col gap-3" aria-label="자막 편집기">
    <PropertyRow label="레이어"><StudioSelect label="레이어" value={layer.id} items={layers.map(l => ({ value: l.id, label: l.name }))} onChange={id => { setLayerId(id); const l = layers.find(l => l.id === id)!; const first = l.main[0] ?? l.sub[0]; if (first) { p.onSelect(first.id, `${id}-${l.main.length ? "main" : "sub"}`); p.onSeek(first.startSec); } }} /></PropertyRow>
    <div role="listbox" aria-label="자막 목록" tabIndex={0} className="max-h-44 shrink-0 overflow-y-auto rounded-md" onKeyDown={e => {
      if (e.target !== e.currentTarget || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault(); const next = entries[Math.max(0, Math.min(entries.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))]; if (next) choose(next);
    }}>{entries.map((c, i) => <Button key={c.id} role="option" aria-label={`자막 ${i + 1}`} aria-selected={i === index} variant="ghost" className={`h-8 w-full justify-start gap-2 px-2 text-xs ${i === index ? "bg-primary/15 text-foreground" : ""}`} onClick={() => choose(c)}><span className="text-muted-foreground">{i + 1}</span><span className="tabular-nums text-muted-foreground">{c.startSec.toFixed(1)}</span><span className="truncate">{plainCaptionText(c.text)}</span>{c.style && <span aria-label="스타일 재정의" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}</Button>)}</div>
    <div className="flex flex-wrap gap-1"><Button variant="outline" size="xs" disabled={index <= 0} onClick={() => { if (entries[index - 1]) choose(entries[index - 1]!); }}>이전</Button><Button variant="outline" size="xs" disabled={index < 0 || index >= entries.length - 1} onClick={() => { if (entries[index + 1]) choose(entries[index + 1]!); }}>다음</Button><Button variant="ghost" size="xs" disabled={!canAdd} onClick={() => { const next = addCaptionClip(p.timeline, layer.id, "main", p.playhead); if (next) { p.onChange(next); const added = captionLayersOf(next).find(l => l.id === layer.id)!.main.find(c => !layer.main.some(old => old.id === c.id)); if (added) choose(added); } }}>자막 더하기</Button><Button variant="ghost" size="xs" disabled={!clip || p.playhead <= clip.startSec || p.playhead >= clip.endSec} onClick={() => { if (clip) { const ids = [`caption-${crypto.randomUUID()}`, `caption-${crypto.randomUUID()}`] as const; p.onChange(splitCaptionClip(p.timeline, clip.id, p.playhead, ids)); p.onSelect(ids[0], `${layer.id}-${row === layer.sub ? "sub" : "main"}`); } }}>여기서 나누기</Button></div>
    {clip ? <><CaptionTextFields {...p} clip={clip} layer={layer} /><PropertyRow label="구간" value={`${(range?.[0] ?? clip.startSec).toFixed(1)}–${(range?.[1] ?? clip.endSec).toFixed(1)}`}><Slider aria-label="자막 구간" min={lower} max={upper} step={0.1} minStepsBetweenThumbs={1} value={range ?? [clip.startSec, clip.endSec]} onValueChange={setRange} onValueCommit={([start, end]) => { if (start !== undefined && end !== undefined) p.onChange(setCaptionRange(p.timeline, clip.id, start, end)); setRange(null); }} /></PropertyRow><PropertyRow label="구간 반복"><Switch aria-label="구간 반복" checked={p.loop} onCheckedChange={loop => { p.onLoopChange(loop); if (loop) p.onSeek(clip.startSec); }} /></PropertyRow><CaptionStyleEditor {...p} clip={clip} layer={layer} /></> : <p className="py-2 text-xs text-muted-foreground">자막을 선택해 주세요</p>}
  </div>;
}
