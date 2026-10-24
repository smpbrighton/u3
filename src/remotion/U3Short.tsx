import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Img, Loop, Sequence } from "remotion";
import { useMemo } from "react";
import { CAPTION_LINE_HEIGHT, CAPTION_MAX_LINE_WIDTH, CAPTION_MAX_LINES, CAPTION_PAD_X, CAPTION_PAD_Y, CAPTION_STYLE, layoutCaption, wrapWords } from "../core/layout";
import type { CaptionChunk } from "../core/captions";
import { ensureFonts, FONT_FAMILY } from "./fonts";
import type { U3ShortProps } from "./types";

ensureFonts();

const fill: React.CSSProperties = { width: "100%", height: "100%" };

const MainVideo: React.FC<{ src: string; sourceStartFrame: number; durationInFrames: number }> = ({ src, sourceStartFrame, durationInFrames }) => (
  <Video src={src} trimBefore={sourceStartFrame} muted loop={false} objectFit="cover" style={fill} />
);

const VideoLayer: React.FC<{ props: U3ShortProps; index: number }> = ({ props, index }) => {
  const sequence = props.render.video[index]!;
  const src = sequence.kind === "meme" ? props.memes[sequence.memeId!] : props.inputs[sequence.inputId!];
  if (!src) throw new Error(`미디어 URL이 없습니다: ${sequence.kind === "meme" ? sequence.memeId : sequence.inputId}`);
  const isPhoto = sequence.kind === "main" && props.inputKinds[sequence.inputId!] === "photo";
  if (isPhoto) return <Img src={src} style={{ ...fill, objectFit: "cover" }} />;
  if (sequence.kind === "meme") {
    const loopFrames = Math.max(1, props.memeFrames[sequence.memeId!] ?? sequence.durationInFrames);
    return <Loop durationInFrames={loopFrames} times={Math.ceil(sequence.durationInFrames / loopFrames)} name="짤 반복 재생">
      <Video src={src} muted objectFit="contain" style={fill} />
    </Loop>;
  }
  return <MainVideo src={src} sourceStartFrame={sequence.sourceStartFrame ?? 0} durationInFrames={sequence.durationInFrames} />;
};

export const SceneCaption: React.FC<{ text: string }> = ({ text }) => {
  const caption = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("자막 측정 canvas를 만들 수 없습니다");
    context.font = `${CAPTION_STYLE.weight} ${CAPTION_STYLE.fontSize}px ${FONT_FAMILY.body}`;
    const width = (value: string) => context.measureText(value).width * 1.04;
    const wrapped = wrapWords(text, CAPTION_MAX_LINE_WIDTH, CAPTION_MAX_LINES, width);
    const lineTexts = wrapped ?? [text.normalize("NFC").trim()];
    const chunk: CaptionChunk = {
      lines: lineTexts.map((line) => ({ text: line, width: width(line), wordIndices: [] })),
      startSec: 0,
      endSec: 1,
      firstWord: 0,
      lastWord: 0,
      overflow: wrapped === null,
    };
    return layoutCaption(chunk, 0);
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
      fontSize: CAPTION_STYLE.fontSize,
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
        <Audio src={src} trimBefore={layer.sourceStartFrame} volume={layer.volume} />
      </Sequence>;
    })}
  </AbsoluteFill>
);
