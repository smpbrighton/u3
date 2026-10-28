import type { CarouselSlide } from "../../../core/carousel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PropertyRow } from "../../components/u3/PropertyRow";
import { PropertySection } from "../../components/u3/PropertySection";
import { Choice, ColorRow, RangeRow } from "../../components/u3/CarouselControls";
import { frameTimeRange } from "./derived-ui-state";

export type HighlightChoice = "none" | "border" | "dim" | "zoom" | "ai-outline";
type Frame = Extract<CarouselSlide["background"], { kind: "frame" }>;
export function BackgroundSection(props: {
  frame: Frame; duration: number; sourceAvailable: boolean; busy: boolean;
  onChange: (fields: { sec?: number; cropY?: number }) => void; onCommit: () => void; onReextract: () => void;
}) {
  const range = frameTimeRange(props.duration);
  return <>
    <RangeRow label="시각" value={Math.min(range.max, props.frame.sec)} min={range.min} max={range.max} step={range.step} unit="초" disabled={!range.max || props.busy} onChange={sec => props.onChange({ sec })} onCommit={props.onCommit} />
    <Button variant="outline" size="sm" className="my-1 w-full" disabled={!props.sourceAvailable || props.busy} onClick={props.onReextract}>이 시각으로 다시 뽑기</Button>
    {!props.sourceAvailable && <p className="my-1 text-xs text-muted-foreground">원본 영상이 없어요</p>}
    <RangeRow label="세로 자르기" value={props.frame.cropY * 100} onChange={value => props.onChange({ cropY: value / 100 })} onCommit={props.onCommit} />
  </>;
}

export function HighlightSection(props: {
  frame: Frame; busy: boolean; onChange: (fields: Partial<NonNullable<Frame["highlight"]>>, commit?: boolean) => void; onCommit: () => void; onAiCreate: () => void; onDrawBox: () => void;
}) {
  const highlight = props.frame.highlight;
  const choice = highlight?.style ?? "none";
  return <PropertySection title="강조">
    <PropertyRow label="형태"><Choice label="강조 형태" value={choice} disabled={props.busy} options={[["none", "없음"], ["border", "테두리"], ["dim", "주변 어둡게"], ["zoom", "확대"], ["ai-outline", "AI 윤곽"]]} onChange={style => props.onChange({ style: style as HighlightChoice }, true)} /></PropertyRow>
    {choice !== "none" && <>
      <PropertyRow label="대상 글"><Input className="h-7 text-xs" disabled={props.busy} aria-label="강조 대상" maxLength={1000} value={highlight?.target ?? ""} onChange={e => props.onChange({ target: e.target.value })} onBlur={props.onCommit} /></PropertyRow>
      {(choice === "border" || choice === "dim") && <>
        <ColorRow label="테두리 색" disabled={props.busy} value={highlight?.color ?? "#FFFFFF"} onChange={color => props.onChange({ color })} onCommit={props.onCommit} />
        <RangeRow label="두께" disabled={props.busy} min={1} max={24} value={highlight?.width ?? 6} unit="px" onChange={width => props.onChange({ width })} onCommit={props.onCommit} />
      </>}
      {choice === "ai-outline" && <><p className="my-2 text-xs text-muted-foreground">글자·얼굴이 원본과 달라질 수 있어요</p><Button variant="outline" size="sm" disabled={props.busy || !props.frame.frame} onClick={props.onAiCreate}>AI 윤곽 만들기</Button></>}
      {!highlight?.box && <PropertyRow label="상자"><span className="whitespace-nowrap text-xs text-muted-foreground">상자 없음</span><Button variant="outline" size="xs" disabled={props.busy} onClick={props.onDrawBox}>상자 그리기</Button></PropertyRow>}
    </>}
  </PropertySection>;
}
