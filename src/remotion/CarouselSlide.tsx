import { AbsoluteFill, Img } from "remotion";
import { ensureFonts, FONT_FAMILY } from "./fonts";
import { textPlacementStyle, type CarouselAspect, type CarouselTextPlacement } from "./carousel-layout";
import { frameCropPosition } from "../core/carousel-frame";
import type { CarouselBox } from "../core/carousel";

export type CarouselSlideProps = {
  imageUrl: string;
  title: string;
  body: string;
  textPlacement: CarouselTextPlacement;
  aspect?: CarouselAspect;
  frameCropY?: number;
  highlight?: { style: "border" | "dim" | "zoom"; box?: CarouselBox; color?: string; width?: number };
};

const fill: React.CSSProperties = { width: "100%", height: "100%" };
ensureFonts();

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ imageUrl, title, body, textPlacement, aspect = "4:5", frameCropY, highlight }) => (
  <AbsoluteFill style={{ backgroundColor: "#202020" }}>
    {imageUrl ? <Img src={imageUrl} style={{ ...fill, objectFit: "cover", objectPosition: frameCropY === undefined ? "50% 50%" : frameCropPosition(frameCropY) }} /> : null}
    {imageUrl && highlight?.box && highlight.style !== "border" ? <Img src={imageUrl} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
      objectPosition: frameCropY === undefined ? "50% 50%" : frameCropPosition(frameCropY),
      clipPath: `inset(${highlight.box.top * 100}% ${(1 - highlight.box.right) * 100}% ${(1 - highlight.box.bottom) * 100}% ${highlight.box.left * 100}%)`,
      ...(highlight.style === "dim" ? { boxShadow: "0 0 0 9999px rgba(0,0,0,.58)" } : {
        transform: "scale(1.8)", transformOrigin: `${((highlight.box.left + highlight.box.right) / 2) * 100}% ${((highlight.box.top + highlight.box.bottom) / 2) * 100}%`,
      }),
    }} /> : null}
    {highlight?.box && highlight.style === "border" ? <div style={{ position: "absolute", left: `${highlight.box.left * 100}%`, top: `${highlight.box.top * 100}%`, width: `${(highlight.box.right - highlight.box.left) * 100}%`, height: `${(highlight.box.bottom - highlight.box.top) * 100}%`, border: `${highlight.width ?? 6}px solid ${highlight.color ?? "#FFFFFF"}`, borderRadius: 24, boxSizing: "border-box" }} /> : null}
    {highlight?.box && highlight.style === "dim" ? <div style={{ position: "absolute", left: `${highlight.box.left * 100}%`, top: `${highlight.box.top * 100}%`, width: `${(highlight.box.right - highlight.box.left) * 100}%`, height: `${(highlight.box.bottom - highlight.box.top) * 100}%`, border: `${highlight.width ?? 6}px solid ${highlight.color ?? "#FFFFFF"}`, boxShadow: "0 0 0 9999px rgba(0,0,0,.58)", borderRadius: 24, boxSizing: "border-box" }} /> : null}
    <AbsoluteFill style={{ background: textPlacement === "center"
      ? "linear-gradient(180deg, rgba(0,0,0,.38) 0%, rgba(0,0,0,.04) 24%, rgba(0,0,0,.62) 40%, rgba(0,0,0,.62) 66%, rgba(0,0,0,.04) 84%, rgba(0,0,0,.38) 100%)"
      : textPlacement === "top"
        ? "linear-gradient(180deg, rgba(0,0,0,.74) 0%, rgba(0,0,0,.48) 24%, transparent 52%, transparent 72%, rgba(0,0,0,.26) 100%)"
        : "linear-gradient(180deg, rgba(0,0,0,.34) 0%, transparent 28%, transparent 48%, rgba(0,0,0,.78) 100%)" }} />
    <AbsoluteFill style={{ ...textPlacementStyle(textPlacement), padding: "9% 8%", color: "#fff", fontFamily: FONT_FAMILY.body, textShadow: "0 2px 12px rgba(0,0,0,.55)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxHeight: "82%", overflow: "hidden" }}>
        <h1 style={{ margin: 0, fontSize: 76, lineHeight: 1.18, fontWeight: 700, wordBreak: "keep-all" }}>{title}</h1>
        <p style={{ width: aspect === "16:9" ? "60%" : "100%", alignSelf: "center", margin: 0, fontSize: 40, lineHeight: 1.5, fontWeight: 400, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>{body}</p>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

