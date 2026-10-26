import { AbsoluteFill, Img } from "remotion";
import { ensureFonts, FONT_FAMILY } from "./fonts";
import { textPlacementStyle, type CarouselAspect, type CarouselTextPlacement } from "./carousel-layout";

export type CarouselSlideProps = {
  imageUrl: string;
  title: string;
  body: string;
  textPlacement: CarouselTextPlacement;
  aspect?: CarouselAspect;
};

const fill: React.CSSProperties = { width: "100%", height: "100%" };
ensureFonts();

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ imageUrl, title, body, textPlacement }) => (
  <AbsoluteFill style={{ backgroundColor: "#202020" }}>
    <Img src={imageUrl} style={{ ...fill, objectFit: "cover" }} />
    <AbsoluteFill style={{ background: textPlacement === "center"
      ? "linear-gradient(180deg, rgba(0,0,0,.38) 0%, rgba(0,0,0,.04) 24%, rgba(0,0,0,.62) 40%, rgba(0,0,0,.62) 66%, rgba(0,0,0,.04) 84%, rgba(0,0,0,.38) 100%)"
      : textPlacement === "top"
        ? "linear-gradient(180deg, rgba(0,0,0,.74) 0%, rgba(0,0,0,.48) 24%, transparent 52%, transparent 72%, rgba(0,0,0,.26) 100%)"
        : "linear-gradient(180deg, rgba(0,0,0,.34) 0%, transparent 28%, transparent 48%, rgba(0,0,0,.78) 100%)" }} />
    <AbsoluteFill style={{ ...textPlacementStyle(textPlacement), padding: "9% 8%", color: "#fff", fontFamily: FONT_FAMILY.body, textShadow: "0 2px 12px rgba(0,0,0,.55)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxHeight: "82%", overflow: "hidden" }}>
        <h1 style={{ margin: 0, fontSize: 76, lineHeight: 1.18, fontWeight: 700, wordBreak: "keep-all" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 40, lineHeight: 1.5, fontWeight: 400, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>{body}</p>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

