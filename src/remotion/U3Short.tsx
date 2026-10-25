import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Img, Loop, Sequence, useCurrentFrame } from "remotion";
import { useMemo } from "react";
import { CAPTION_CENTER_Y, CAPTION_LINE_HEIGHT, CAPTION_MAX_LINE_WIDTH, CAPTION_PAD_X, CAPTION_PAD_Y, CAPTION_STYLE, fitCaptionText, layoutCaption } from "../core/layout";
import type { CaptionChunk } from "../core/captions";
import { ensureFonts, FONT_FAMILY } from "./fonts";
import type { U3ShortProps } from "./types";
import type { ClipTransition } from "../core/schema";
import type { RenderAudioLayer, RenderTransition, RenderVideoSequence } from "../core/timeline/to-render";
import { transitionProgressAt, transitionStyleAt, type TransitionStyle } from "../core/timeline/transitions";

ensureFonts();

const fill: React.CSSProperties = { width: "100%", height: "100%" };

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
  const layerStyle: React.CSSProperties = { ...fill, opacity: edge.opacity, transform: edge.transform, clipPath: edge.clipPath };
  if (isPhoto) return <AbsoluteFill style={layerStyle}><Img src={src} style={{ ...fill, objectFit: "cover" }} /></AbsoluteFill>;
  if (sequence.kind === "meme") {
    const loopFrames = Math.max(1, props.memeFrames[sequence.memeId!] ?? sequence.durationInFrames);
    return <AbsoluteFill style={layerStyle}><Loop durationInFrames={loopFrames} times={Math.ceil(sequence.durationInFrames / loopFrames)} name="짤 반복 재생">
      <Video src={src} trimBefore={sourceStartFrame} playbackRate={playbackRate} muted objectFit="contain" style={fill} />
    </Loop></AbsoluteFill>;
  }
  return <AbsoluteFill style={layerStyle}><MainVideo src={src} sourceStartFrame={sourceStartFrame ?? sequence.sourceStartFrame ?? 0} playbackRate={playbackRate} /></AbsoluteFill>;
};

const OverlayLayer: React.FC<{ props: U3ShortProps; index: number }> = ({ props, index }) => {
  const clip = props.render.overlay[index]!;
  const frame = useCurrentFrame();
  const edge = overlayEdgeStyle(clip.startTransition, clip.endTransition, frame, clip.durationInFrames, props.render.fps);
  const src = clip.kind === "meme" ? props.memes[clip.memeId!] : props.overlayInputs[clip.inputId!];
  if (!src) throw new Error(`겹친 영상 URL이 없습니다: ${clip.kind === "meme" ? clip.memeId : clip.inputId}`);
  const style: React.CSSProperties = { position: "absolute", left: `${clip.x * 100}%`, top: `${clip.y * 100}%`, width: `${clip.width * 100}%`, transform: `translate(-50%, -50%) ${edge.transform}`, opacity: edge.opacity, clipPath: edge.clipPath, overflow: "hidden", display: "block" };
  const contentStyle: React.CSSProperties = { display: "block", width: "100%", height: "auto" };
  if (clip.kind === "photo") return <Img src={src} style={{ ...style, ...contentStyle }} />;
  const video = <Video src={src} muted trimBefore={clip.kind === "video" ? clip.sourceStartFrame ?? 0 : 0} loop={false} objectFit="contain" style={{ ...style, ...contentStyle }} />;
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

export const SceneCaption: React.FC<{ text: string }> = ({ text }) => {
  const caption = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("자막 측정 canvas를 만들 수 없습니다");
    const fit = fitCaptionText(text, CAPTION_MAX_LINE_WIDTH, (value, fontSize) => {
      context.font = `${CAPTION_STYLE.weight} ${fontSize}px ${FONT_FAMILY.body}`;
      return context.measureText(value).width * 1.04;
    });
    const lineTexts = fit.lines;
    const width = (value: string) => {
      context.font = `${CAPTION_STYLE.weight} ${fit.fontSize}px ${FONT_FAMILY.body}`;
      return context.measureText(value).width * 1.04;
    };
    const chunk: CaptionChunk = {
      lines: lineTexts.map((line) => ({ text: line, width: width(line), wordIndices: [] })),
      startSec: 0,
      endSec: 1,
      firstWord: 0,
      lastWord: 0,
      overflow: fit.overflow,
    };
    const layout = layoutCaption(chunk, 0);
    const height = lineTexts.length * fit.fontSize * CAPTION_LINE_HEIGHT + 2 * CAPTION_PAD_Y;
    return { ...layout, fontSize: fit.fontSize, box: { ...layout.box, y: CAPTION_CENTER_Y - height / 2, height } };
  }, [text]);
  return (
    <div style={{
      position: "absolute",
      left: caption.box.x,
      top: caption.box.y,
      width: caption.box.width,
      height: caption.box.height,
      boxSizing: "border-box",
      padding: `${CAPTION_PAD_Y}px ${CAPTION_PAD_X}px`,
      backgroundColor: "rgba(0, 0, 0, 0.62)",
      borderRadius: 20,
      color: "#FFFFFF",
      fontFamily: FONT_FAMILY.body,
      fontWeight: CAPTION_STYLE.weight,
      fontSize: caption.fontSize,
      lineHeight: CAPTION_LINE_HEIGHT,
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}>
      {caption.lines.map((line, index) => <div key={index} style={{ whiteSpace: "pre" }}>{line}</div>)}
    </div>
  );
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
        <SceneCaption text={caption.text} />
      </Sequence>
    ))}
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
