import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Img, Loop, Sequence, useCurrentFrame } from "remotion";
import type { U3ShortProps } from "./types";

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

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  return <div style={{ position: "absolute", left: 72, right: 72, bottom: 210, display: "flex", justifyContent: "center", textAlign: "center", color: "white", fontFamily: "Arial, sans-serif", fontSize: 76, fontWeight: 900, lineHeight: 1.2, whiteSpace: "pre-wrap", overflowWrap: "anywhere", WebkitTextStroke: "3px #111", paintOrder: "stroke fill", textShadow: "0 5px 12px #000", opacity: frame >= 0 ? 1 : 0 }}>{text}</div>;
};

export const SceneCaption: React.FC<{ text: string }> = Caption;

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
