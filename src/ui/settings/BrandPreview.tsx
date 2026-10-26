import { Player } from "@remotion/player";
import type { BrandSettings } from "../../core/schema";
import { U3Short } from "../../remotion/U3Short";
import type { U3ShortProps } from "../../remotion/types";

const previewBackground = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="100%" height="100%" fill="#888888"/></svg>')}`;

export function BrandPreview(props: { brand: BrandSettings; watermarkUrl: string | null }) {
  const { brand } = props;
  const playerProps: U3ShortProps = {
    render: {
      fps: 30,
      video: [{ id: "preview-background", kind: "main", startFrame: 0, durationInFrames: 1, inputId: "preview-background" }],
      overlay: [], captions: [], audio: [], transitions: [], durationInFrames: 1,
      titleBar: {
        visible: true,
        text: "타이틀 미리보기",
        height: brand.titleBar.height,
        font: brand.titleBar.font,
        fontSize: brand.titleBar.fontSize,
        color: brand.titleBar.color,
        bgColor: brand.titleBar.bgColor,
        bgOpacity: brand.titleBar.bgOpacity,
        opacity: 1,
      },
      ...(brand.watermark?.file && props.watermarkUrl ? { watermark: {
        visible: true,
        file: props.watermarkUrl,
        x: brand.watermark.x,
        y: brand.watermark.y,
        width: brand.watermark.width,
        opacity: brand.watermark.opacity,
      } } : {}),
    },
    inputs: { "preview-background": previewBackground },
    inputKinds: { "preview-background": "photo" },
    memes: {}, overlayInputs: {}, memeFrames: {},
  };

  return <div className="brand-preview-wrap" aria-label="브랜드 미리보기">
    <Player component={U3Short} inputProps={playerProps} durationInFrames={1} fps={30} compositionWidth={1080} compositionHeight={1920} controls={false} acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
  </div>;
}
