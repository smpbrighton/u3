import { useEffect, useRef } from "react";
import type { CarouselTextObject } from "../../../core/carousel";
import { Button } from "../../components/ui/button";
import { PropertyRow } from "../../components/u3/PropertyRow";
import { PropertySection } from "../../components/u3/PropertySection";
import { Choice, ColorRow, RangeRow, TextBlock } from "../../components/u3/CarouselControls";

export const textRoleName = (text: CarouselTextObject) => ({ title: "제목", body: "본문", extra: "추가 글" })[text.role];
export function CarouselTextInspector(props: {
  texts: CarouselTextObject[]; selectedId: string; onSelect: (id: string) => void;
  onChange: (texts: CarouselTextObject[]) => void; onCommit?: () => void;
}) {
  const text = props.texts.find(t => t.id === props.selectedId) ?? props.texts[0];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest" }); }, [text?.id]);
  if (!text) return null;
  function update(patch: Partial<CarouselTextObject>, commit = false) {
    props.onChange(props.texts.map(t => t.id === text!.id ? { ...t, ...patch } : t));
    if (commit) props.onCommit?.();
  }
  const ratioRows = [["x", "가로 위치"], ["y", "세로 위치"], ["width", "폭"]] as const;
  return <PropertySection title="글" className="border-t-0 pt-0">
    <div ref={ref} className="min-w-0 rounded-lg border border-primary p-2">
      <TextBlock key={text.id} label={textRoleName(text)} value={text.text} maxLength={text.role === "title" ? 500 : 5000} onChange={e => update({ text: e.target.value })} onBlur={props.onCommit} />
      {ratioRows.map(([key, label]) => <RangeRow key={key} label={label} value={text[key] * 100} onChange={value => update({ [key]: value / 100 })} onCommit={() => props.onCommit?.()} />)}
      <PropertyRow label="폰트"><Choice label="폰트" value={text.font} options={[["pretendard", "Pretendard"], ["gmarket", "G마켓 산스"], ["tmon", "티몬체"]]} onChange={font => update({ font: font as CarouselTextObject["font"], weight: font === "gmarket" ? 700 : font === "tmon" ? 400 : text.weight }, true)} /></PropertyRow>
      <PropertyRow label="굵기"><Choice label="굵기" value={String(text.weight)} disabled={text.font !== "pretendard"} options={[["400", "400"], ["700", "700"]]} onChange={weight => update({ weight: Number(weight) as 400 | 700 }, true)} /></PropertyRow>
      <RangeRow label="크기" value={text.fontSize} min={12} max={200} unit="px" onChange={fontSize => update({ fontSize })} onCommit={() => props.onCommit?.()} />
      <ColorRow label="색" value={text.color} onChange={color => update({ color })} onCommit={props.onCommit} />
      <PropertyRow label="정렬"><Choice label="정렬" value={text.align} options={[["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]} onChange={align => update({ align: align as CarouselTextObject["align"] }, true)} /></PropertyRow>
      <PropertyRow label="효과"><Choice label="효과" value={text.effect} options={[["none", "없음"], ["shadow", "그림자"], ["bar", "반투명 바"], ["outline", "외곽선"]]} onChange={effect => update({ effect: effect as CarouselTextObject["effect"] }, true)} /></PropertyRow>
      {text.effect === "bar" && <ColorRow label="바 색" value={text.barColor ?? "#000000"} onChange={barColor => update({ barColor })} onCommit={props.onCommit} />}
      <RangeRow label="투명도" value={text.opacity * 100} onChange={opacity => update({ opacity: opacity / 100 })} onCommit={() => props.onCommit?.()} />
      {text.role === "extra" && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => { props.onChange(props.texts.filter(t => t.id !== text.id)); props.onSelect(props.texts[0]!.id); props.onCommit?.(); }}>글 지우기</Button>}
    </div>
    {props.texts.filter(t => t.id !== text.id).map(other => <Button key={other.id} variant="ghost" className="w-full min-w-0 justify-start text-xs" onClick={() => props.onSelect(other.id)}><span className="truncate">{textRoleName(other)} · {other.text}</span></Button>)}
    <Button variant="outline" size="sm" className="mt-2 self-start" disabled={props.texts.length >= 5} onClick={() => {
      const extra: CarouselTextObject = { ...props.texts[1]!, id: `text-${crypto.randomUUID()}`, role: "extra", text: "", x: 0.08, y: 0.5 };
      props.onChange([...props.texts, extra]); props.onSelect(extra.id); props.onCommit?.();
    }}>글 더하기</Button>
  </PropertySection>;
}
