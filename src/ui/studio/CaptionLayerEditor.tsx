import { HexColorPicker } from "react-colorful";
import type { CaptionLayer, Project, Timeline } from "../../core/schema";
import { addCaptionLayer, deleteCaptionLayer, replaceCaptionSubtitles, swapCaptionRows } from "../../core/caption-layers";
import { captionLayersOf, withCaptionLayers } from "../../core/schema";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { StudioSelect, StudioSlider, StudioSwitch, StudioTextInput } from "./SeedControls";
import { api } from "../api";

export function CaptionLayerEditor(props: { project: Project; timeline: Timeline; layer: CaptionLayer; onChange: (timeline: Timeline) => void }) {
  const update = (changes: Partial<CaptionLayer> | { style: Partial<CaptionLayer["style"]> }) => {
    const next = { ...props.layer, ...changes, style: "style" in changes ? { ...props.layer.style, ...changes.style } : props.layer.style };
    props.onChange(withCaptionLayers(props.timeline, captionLayersOf(props.timeline).map(layer => layer.id === props.layer.id ? next : layer)));
  };
  const style = props.layer.style;
  const color = (label: string, value: string, set: (color: string) => void) => <label>{label}<HexColorPicker color={value} onChange={set} /></label>;
  return <div className="caption-layer-editor">
    <StudioTextInput label="레이어 이름" value={props.layer.name} onChange={name => update({ name: name.trim() || "자막" })} />
    <StudioSelect label="폰트" value={style.font} items={[{ value: "pretendard", label: "Pretendard" }, { value: "gmarket", label: "G마켓 산스" }, { value: "tmon", label: "티몬체" }]} onChange={font => update({ style: { font: font as CaptionLayer["style"]["font"] } })} />
    <label>메인 크기<StudioSlider label="메인 크기" min={20} max={100} step={1} value={style.mainSize} onChange={mainSize => update({ style: { mainSize } })} /></label>
    <label>서브 크기<StudioSlider label="서브 크기" min={16} max={80} step={1} value={style.subSize} onChange={subSize => update({ style: { subSize } })} /></label>
    {color("글자 색", style.color, color => update({ style: { color } }))}
    <label>글자 투명도<StudioSlider label="글자 투명도" min={0} max={1} step={0.01} value={style.textOpacity} onChange={textOpacity => update({ style: { textOpacity } })} /></label>
    <StudioSwitch label="자막바" checked={style.bar} onChange={bar => update({ style: { bar } })} />
    {style.bar ? <>{color("자막바 색", style.barColor, barColor => update({ style: { barColor } }))}<label>자막바 투명도<StudioSlider label="자막바 투명도" min={0} max={1} step={0.01} value={style.barOpacity} onChange={barOpacity => update({ style: { barOpacity } })} /></label></> : null}
    <ActionButton variant="neutralWeak" onClick={() => props.onChange(withCaptionLayers(props.timeline, captionLayersOf(props.timeline).map(item => item.id === props.layer.id ? swapCaptionRows(item) : item)))}>메인·서브 바꾸기</ActionButton>
    <ActionButton variant="neutralWeak" onClick={() => props.onChange(addCaptionLayer(props.timeline))}>자막 레이어 더하기</ActionButton>
    <ActionButton variant="neutralWeak" disabled={captionLayersOf(props.timeline).length < 2} onClick={() => props.onChange(deleteCaptionLayer(props.timeline, props.layer.id))}>레이어 지우기</ActionButton>
    <ActionButton variant="neutralWeak" onClick={async () => { const result = await api<{ captions: Array<{ id: string; text: string }> }>("POST", `/api/projects/${props.project.id}/captions/translate`, { layerId: props.layer.id }); props.onChange(replaceCaptionSubtitles(props.timeline, props.layer.id, result.captions)); }}>서브 자막 만들기</ActionButton>
  </div>;
}
