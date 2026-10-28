import { Composition } from "remotion";
import { U3Short } from "./U3Short";
import type { U3ShortProps } from "./types";
import { CarouselSlide, type CarouselSlideProps } from "./CarouselSlide";
import { defaultTexts } from "../core/carousel";
import { carouselCanvasSize } from "./carousel-layout";

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    id="U3Short"
    component={U3Short}
    defaultProps={{ render: { fps: 30, video: [], overlay: [], captions: [], audio: [], durationInFrames: 1 }, inputs: {}, inputKinds: {}, memes: {}, overlayInputs: {}, memeFrames: {} }}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.render.durationInFrames) })}
  />
  <Composition
    id="CarouselSlide"
    component={CarouselSlide}
    defaultProps={{ imageUrl: "", texts: defaultTexts("4:5"), brightness: 1, shade: 0.35, aspect: "4:5" } satisfies CarouselSlideProps}
    width={carouselCanvasSize("4:5").width}
    height={carouselCanvasSize("4:5").height}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }) => ({ ...carouselCanvasSize(props.aspect ?? "4:5"), durationInFrames: 1 })}
  />
  </>
);

export type { U3ShortProps };
