import { Composition } from "remotion";
import { U3Short } from "./U3Short";
import type { U3ShortProps } from "./types";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="U3Short"
    component={U3Short}
    defaultProps={{ render: { fps: 30, video: [], captions: [], audio: [], durationInFrames: 1 }, inputs: {}, inputKinds: {}, memes: {}, memeFrames: {} }}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.render.durationInFrames) })}
  />
);

export type { U3ShortProps };
