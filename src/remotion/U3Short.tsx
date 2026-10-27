import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Img, Loop, Sequence, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { CAPTION_LINE_HEIGHT, CAPTION_PAD_X, CAPTION_PAD_Y, stackCaptionRows } from "../core/layout";
import { captionWeight, measureCaption } from "./caption-measure";
import { ensureFonts } from "./fonts";
import { CAPTION_FONT_FAMILY } from "../core/fonts";
import type { U3ShortProps } from "./types";
import type { ClipTransition } from "../core/schema";
import type { RenderAudioLayer, RenderCaption, RenderTransition, RenderVideoSequence } from "../core/timeline/to-render";
import { transitionProgressAt, transitionStyleAt, type TransitionStyle } from "../core/timeline/transitions";
import { overlayMediaStyle } from "./overlay-style";

ensureFonts();

const fill: React.CSSProperties = { width: "100%", height: "100%" };
const colorWithAlpha = (color: string, alpha: number) => {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = match[1]!;
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}, ${Math.max(0, Math.min(1, alpha))})`;
};

const MainVideo: React.FC<{ src: string; sourceStartFrame: number; playbackRate?: number }> = ({ src, sourceStartFrame, playbackRate = 1 }) => (
  <Video src={src} trimBefore={sourceStartFrame} playbackRate={playbackRate} muted loop={false} objectFit="cover" style={fill} />
);

const VideoLayer: React.FC<{ props: U3ShortProps; index: number; sourceStartFrame?: number; playbackRate?: number; style?: TransitionStyle }> = ({ props, index, sourceStartFrame, playbackRate = 1, style }) => {
  const sequence = props.render.video[index]!;
  const frame = useCurrentFrame();
  const src = sequence.kind === "meme" ? props.memes[sequence.memeId!] : props.inputs[sequence.inputId!];
  if (!src) throw new Error(`미디어 URL이 없습니다: ${sequence.kind === "meme" ? sequence.memeId : sequence.inputId}`);
  const isPhoto = sequence.kind === "main" && props.inputKinds[sequence.inputId!] === "photo";
  const edge = style ?? videoEdgeStyle(sequence, frame, props.render.fps);
  const layerStyle: React.CSSProperties = { ...fill, opacity: (sequence.opacity ?? 1) * edge.opacity, transform: edge.transform, clipPath: edge.clipPath };
  if (isPhoto) return <AbsoluteFill data-u3-target={sequence.id} style={layerStyle}><Img src={src} style={{ ...fill, objectFit: "cover" }} /></AbsoluteFill>;
  if (sequence.kind === "meme") {
    const loopFrames = Math.max(1, props.memeFrames[sequence.memeId!] ?? sequence.durationInFrames);
    return <AbsoluteFill data-u3-target={sequence.id} style={layerStyle}><Loop durationInFrames={loopFrames} times={Math.ceil(sequence.durationInFrames / loopFrames)} name="짤 반복 재생">
      <Video src={src} trimBefore={sourceStartFrame} playbackRate={playbackRate} muted objectFit="contain" style={fill} />
    </Loop></AbsoluteFill>;
  }
  return <AbsoluteFill data-u3-target={sequence.id} style={layerStyle}><MainVideo src={src} sourceStartFrame={sourceStartFrame ?? sequence.sourceStartFrame ?? 0} playbackRate={playbackRate} /></AbsoluteFill>;
};

const OverlayLayer: React.FC<{ props: U3ShortProps; index: number }> = ({ props, index }) => {
  const clip = props.render.overlay[index]!;
  const frame = useCurrentFrame();
  const edge = overlayEdgeStyle(clip.startTransition, clip.endTransition, frame, clip.durationInFrames, props.render.fps);
  const src = clip.kind === "meme" ? props.memes[clip.memeId!] : props.overlayInputs[clip.inputId!];
  if (!src) throw new Error(`겹친 영상 URL이 없습니다: ${clip.kind === "meme" ? clip.memeId : clip.inputId}`);
  const style = overlayMediaStyle(clip, { ...edge, opacity: edge.opacity * (clip.opacity ?? 1) }, clip.kind === "meme" ? props.memeAspects?.[clip.memeId!] : undefined);
  if (clip.kind === "photo") return <Img data-u3-target={clip.id} src={src} style={style} />;
  const video = <Video data-u3-target={clip.id} src={src} muted trimBefore={clip.kind === "video" ? clip.sourceStartFrame ?? 0 : 0} loop={false} objectFit="contain" style={style} />;
  if (clip.kind !== "meme") return video;
  const loopFrames = Math.max(1, props.memeFrames[clip.memeId!] ?? clip.durationInFrames);
  return <Loop durationInFrames={loopFrames} times={Math.ceil(clip.durationInFrames / loopFrames)} name="겹친 짤 반복 재생">{video}</Loop>;
};

const TransitionLayer: React.FC<{ props: U3ShortProps; transition: RenderTransition }> = ({ props, transition }) => {
  const frame = useCurrentFrame();
  const progress = transitionProgressAt(frame + 1, 0, transition.durationInFrames);
  const fromIndex = transition.fromId ? props.render.video.findIndex((item) => item.id === transition.fromId) : -1;
  const toIndex = transition.toId ? props.render.video.findIndex((item) => item.id === transition.toId) : -1;
  const outgoing = transition.kind.kind === "black-fade"
    ? transitionStyleAt(transition.kind, Math.min(1, progress * 2), "end")
    : transitionStyleAt(transition.kind, progress, "end");
  const incoming = transition.kind.kind === "black-fade"
    ? transitionStyleAt(transition.kind, Math.max(0, (progress - 0.5) * 2), "start")
    : transitionStyleAt(transition.kind, progress, "start");
  return <>
    {fromIndex >= 0 ? <Sequence from={transition.startFrame} durationInFrames={transition.durationInFrames} layout="none" name={`전환 나감 ${transition.id}`}>
      <VideoLayer props={props} index={fromIndex} sourceStartFrame={transition.fromSourceStartFrame} playbackRate={transition.playbackRate} style={outgoing} />
    </Sequence> : null}
    {toIndex >= 0 ? <Sequence from={transition.startFrame} durationInFrames={transition.durationInFrames} layout="none" name={`전환 들어옴 ${transition.id}`}>
      <VideoLayer props={props} index={toIndex} sourceStartFrame={transition.toSourceStartFrame} playbackRate={transition.playbackRate} style={incoming} />
    </Sequence> : null}
  </>;
};

function videoEdgeStyle(sequence: RenderVideoSequence, frame: number, fps: number): TransitionStyle {
  return overlayEdgeStyle(sequence.startTransition, sequence.endTransition, frame, sequence.durationInFrames, fps);
}

function overlayEdgeStyle(start: ClipTransition | undefined, end: ClipTransition | undefined, frame: number, duration: number, fps: number): TransitionStyle {
  let style: TransitionStyle = { opacity: 1, transform: "translate(0, 0) scale(1)", clipPath: "inset(0 0 0 0)" };
  const startFrames = start && start.kind.kind !== "none" ? Math.min(Math.round(start.durationSec * fps), Math.floor(duration / 2)) : 0;
  const endFrames = end && end.kind.kind !== "none" ? Math.min(Math.round(end.durationSec * fps), Math.floor(duration / 2)) : 0;
  if (start && startFrames && frame < startFrames) style = transitionStyleAt(start.kind, transitionProgressAt(frame + 1, 0, startFrames), "start");
  if (end && endFrames && frame >= duration - endFrames) style = transitionStyleAt(end.kind, transitionProgressAt(frame - (duration - endFrames) + 1, 0, endFrames), "end");
  return style;
}

function audioVolume(layer: RenderAudioLayer, localFrame: number): number {
  const frame = layer.startFrame + localFrame;
  let multiplier = 1;
  for (const effect of layer.volumeTransitions ?? []) {
    if (frame >= effect.startFrame + effect.durationInFrames) multiplier *= effect.to;
    else if (frame >= effect.startFrame) {
      const progress = transitionProgressAt(frame - effect.startFrame, 0, effect.durationInFrames);
      multiplier *= effect.from + (effect.to - effect.from) * progress;
    }
  }
  return layer.volume * multiplier;
}

export const SceneCaption: React.FC<{ caption: RenderCaption; partner?: RenderCaption }> = ({ caption, partner }) => {
  const { text, style, row } = caption;
  const layout = useMemo(() => measureCaption(text, style, row), [text, style, row]);
  const partnerLayout = useMemo(() => partner ? measureCaption(partner.text, partner.style, partner.row) : undefined, [partner?.text, partner?.style, partner?.row]);
  const frame = stackCaptionRows(caption.y * 1920, { [row]: layout.height, ...(partner && partnerLayout ? { [partner.row]: partnerLayout.height } : {}) })[row]!;
  const width = Math.max(layout.width, partnerLayout?.width ?? 0);
  const borderRadius = !partner ? 20 : row === "main" ? "20px 20px 0 0" : "0 0 20px 20px";
  return (
    <div data-u3-target={caption.layerId} style={{
      position: "absolute",
      left: `${caption.x * 100}%`,
      top: frame.top,
      width,
      height: frame.height,
      transform: "translateX(-50%)",
      boxSizing: "border-box",
      backgroundColor: style.bar ? colorWithAlpha(style.barColor, caption.clipOpacity * caption.layerOpacity * caption.barOpacity) : "transparent",
      borderRadius,
      color: style.color,
      fontFamily: CAPTION_FONT_FAMILY[style.font],
      fontWeight: captionWeight(style.font),
      fontSize: layout.fontSize,
      lineHeight: CAPTION_LINE_HEIGHT,
      textAlign: "center",
      padding: `${CAPTION_PAD_Y}px ${CAPTION_PAD_X}px`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}>
      {layout.lines.map((line, index) => <div key={index} style={{ whiteSpace: "pre", opacity: caption.opacity ?? 1 }}>{line}</div>)}
    </div>
  );
};

const BrandTitleBar: React.FC<{ titleBar: NonNullable<U3ShortProps["render"]["titleBar"]> }> = ({ titleBar }) => {
  const fontFamily = CAPTION_FONT_FAMILY[titleBar.font as keyof typeof CAPTION_FONT_FAMILY];
  const fontWeight = captionWeight(titleBar.font as keyof typeof CAPTION_FONT_FAMILY);
  const fontSize = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("타이틀 바 글자 측정 canvas를 만들 수 없습니다");
    const maxWidth = 1080 - 2 * CAPTION_PAD_X;
    let size = titleBar.fontSize;
    while (size > 12) {
      context.font = `${fontWeight} ${size}px ${fontFamily}`;
      if (context.measureText(titleBar.text).width * 1.04 <= maxWidth) break;
      size = Math.max(12, size - 1);
    }
    return size;
  }, [titleBar.text, titleBar.fontSize, fontFamily, fontWeight]);

  return <AbsoluteFill style={{ pointerEvents: "none", alignItems: "center", justifyContent: "center", height: titleBar.height }}>
    <div style={{ position: "absolute", inset: 0, backgroundColor: colorWithAlpha(titleBar.bgColor, titleBar.bgOpacity * titleBar.opacity) }} />
    <div style={{ position: "relative", width: "100%", padding: `0 ${CAPTION_PAD_X}px`, boxSizing: "border-box", color: titleBar.color, fontFamily, fontSize, fontWeight, textAlign: "center", opacity: titleBar.opacity, whiteSpace: "nowrap" }}>{titleBar.text}</div>
  </AbsoluteFill>;
};

export const U3Short: React.FC<U3ShortProps> = (props) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {props.render.video.map((item, index) => (
      <Sequence key={item.id} from={item.startFrame} durationInFrames={item.durationInFrames} layout="none" name={`영상 ${item.id}`}>
        <VideoLayer props={props} index={index} />
      </Sequence>
    ))}
    {props.render.transitions.map((transition) => <TransitionLayer key={transition.id} props={props} transition={transition} />)}
    {props.render.overlay.map((item, index) => (
      <Sequence key={item.id} from={item.startFrame} durationInFrames={item.durationInFrames} layout="none" name={`겹친 영상 ${item.id}`}>
        <OverlayLayer props={props} index={index} />
      </Sequence>
    ))}
    {props.render.captions.map((caption) => (
      <Sequence key={caption.id} from={caption.startFrame} durationInFrames={caption.durationInFrames} layout="none" name={`자막 ${caption.id}`}>
        <SceneCaption caption={caption} partner={props.render.captions.find((other) => other.layerId === caption.layerId && other.row !== caption.row && other.startFrame < caption.startFrame + caption.durationInFrames && other.startFrame + other.durationInFrames > caption.startFrame)} />
      </Sequence>
    ))}
    {props.render.titleBar?.visible ? <BrandTitleBar titleBar={props.render.titleBar} /> : null}
    {props.render.watermark?.visible ? <Img data-u3-target="watermark" src={props.render.watermark.file} style={{ position: "absolute", left: `${props.render.watermark.x * 100}%`, top: `${props.render.watermark.y * 100}%`, width: `${props.render.watermark.width * 100}%`, height: "auto", transform: "translate(-50%, -50%)", opacity: props.render.watermark.opacity }} /> : null}
    {props.render.audio.map((layer) => {
      const src = layer.track === "source" || layer.track === "stem-voice" || layer.track === "stem-bg"
        ? props.inputs[layer.inputId!]
        : layer.track === "meme" ? props.memes[layer.inputId!] : layer.file;
      if (!src) throw new Error(`오디오 URL이 없습니다: ${layer.id}`);
      return <Sequence key={layer.id} from={layer.startFrame} durationInFrames={layer.durationInFrames} layout="none" name={`오디오 ${layer.id}`}>
        <Audio src={src} trimBefore={layer.sourceStartFrame} volume={(frame) => audioVolume(layer, frame)} />
      </Sequence>;
    })}
  </AbsoluteFill>
);
