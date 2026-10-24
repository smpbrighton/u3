import React from "react";
import { Audio, Composition, staticFile } from "remotion";

const Clip: React.FC = () => (
  <div style={{ width: 1080, height: 1920, background: "#14263d", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 180, fontFamily: "Arial" }}>
    U3 <Audio src={staticFile("tone.wav")} />
  </div>
);

export const RemotionRoot: React.FC = () => (
  <Composition id="Spike" component={Clip} durationInFrames={90} fps={30} width={1080} height={1920} />
);
