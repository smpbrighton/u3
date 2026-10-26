import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { ActionButton } from "../../../../seed-design/ui/action-button";
import { SegmentedControl, SegmentedControlItem } from "../../../../seed-design/ui/segmented-control";
import { TextField, TextFieldInput } from "../../../../seed-design/ui/text-field";
import { PageBanner } from "../../../../seed-design/ui/page-banner";
import { StudioSlider } from "../../studio/SeedControls";
import { frameTimeRange } from "./derived-ui-state";

export type HighlightChoice = "none" | "border" | "dim" | "zoom" | "ai-outline";
export function BackgroundSection(props: {
  sec: number; cropY: number; duration: number; sourceAvailable: boolean; canReextract: boolean;
  style: Exclude<HighlightChoice, "none">; choice: HighlightChoice; target: string; color: string; width: number;
  onTime: (sec: number) => void; onReextract: () => void; onCropY: (value: number) => void;
  onStyle: (style: HighlightChoice) => void; onTarget: (target: string) => void; onTargetSave: (target: string) => void;
  onColor: (color: string) => void; onWidth: (width: number) => void; onAiCreate: () => void;
}) {
  const [choice, setChoice] = useState<HighlightChoice>(props.choice);
  const [target, setTarget] = useState(props.target);
  useEffect(() => setChoice(props.choice), [props.choice]);
  useEffect(() => setTarget(props.target), [props.target]);
  const range = frameTimeRange(props.duration);
  const clampedTime = Math.min(range.max, Math.max(range.min, props.sec));
  return <section className="carousel-background-section" aria-labelledby="carousel-background-title">
    <h3 id="carousel-background-title">배경</h3>
    <label className="studio-range-label">시각 <b>{clampedTime.toFixed(1)}초</b><StudioSlider label="프레임 시각" min={range.min} max={range.max} step={range.step} value={clampedTime} disabled={!range.max} onChange={props.onTime} /></label>
    <ActionButton variant="neutralWeak" disabled={!props.canReextract} onClick={props.onReextract}>프레임 다시 뽑기</ActionButton>
    {!props.sourceAvailable ? <p className="carousel-disabled-reason">원본 프로젝트가 없어 프레임을 다시 뽑을 수 없어요.</p> : null}
    <label className="studio-range-label">세로 자르기 위치 <b>{Math.round(props.cropY * 100)}%</b><StudioSlider label="세로 자르기 위치" min={0} max={1} step={0.01} value={props.cropY} onChange={props.onCropY} /></label>
    <div className="carousel-placement"><span>강조 형태</span><SegmentedControl aria-label="강조 형태" value={choice} onValueChange={value => { const next = value as HighlightChoice; setChoice(next); props.onStyle(next); }}>
      <SegmentedControlItem value="none">없음</SegmentedControlItem><SegmentedControlItem value="border">테두리</SegmentedControlItem><SegmentedControlItem value="dim">주변 어둡게</SegmentedControlItem><SegmentedControlItem value="zoom">확대</SegmentedControlItem><SegmentedControlItem value="ai-outline">AI 윤곽</SegmentedControlItem>
    </SegmentedControl></div>
    {choice !== "none" ? <>
      <TextField label="강조 대상" value={target} onValueChange={({ value }) => { setTarget(value); props.onTarget(value); }}><TextFieldInput maxLength={1000} onBlur={() => props.onTargetSave(target)} /></TextField>
      {choice === "border" || choice === "dim" ? <><label className="carousel-color-label">테두리 색</label><HexColorPicker color={props.color} onChange={props.onColor} /><label className="studio-range-label">테두리 두께 <b>{props.width}px</b><StudioSlider label="테두리 두께" min={1} max={24} step={1} value={props.width} onChange={props.onWidth} /></label></> : null}
      {choice === "ai-outline" ? <><PageBanner tone="warning" variant="weak" description="AI 가 프레임 전체를 다시 그려 상품 글자·얼굴이 원본과 달라질 수 있어요." /><ActionButton variant="neutralWeak" onClick={props.onAiCreate}>AI 윤곽 만들기</ActionButton></> : null}
    </> : null}
  </section>;
}
