import { AbsoluteFill, Img } from "remotion";
import { ensureFonts } from "./fonts";
import { carouselCanvasSize, textObjectStyle, shadeStyle, logoStyle, type CarouselAspect } from "./carousel-layout";
import { frameCropPosition } from "../core/carousel-frame";
import type { CarouselBox, CarouselTextObject, CarouselLogo } from "../core/carousel";

export type CarouselSlideProps = {
  imageUrl: string;
  texts: CarouselTextObject[];
  logo?: CarouselLogo;
  logoUrl?: string;
  brightness: number;
  shade: number;
  aspect?: CarouselAspect;
  frameCropY?: number;
  highlight?: { style: "border" | "dim" | "zoom"; box?: CarouselBox; color?: string; width?: number };
};

const fill: React.CSSProperties = { width: "100%", height: "100%" };
ensureFonts();

export const CarouselSlide: React.FC<CarouselSlideProps> = ({ imageUrl, texts, logo, logoUrl, brightness, shade, aspect = "4:5", frameCropY, highlight }) => (
  <AbsoluteFill style={{ backgroundColor: "#202020" }}>
    {imageUrl ? <Img src={imageUrl} style={{ ...fill, filter: `brightness(${brightness})`, objectFit: "cover", objectPosition: frameCropY === undefined ? "50% 50%" : frameCropPosition(frameCropY) }} /> : null}
    {imageUrl && highlight?.box && highlight.style !== "border" ? <Img src={imageUrl} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: `brightness(${brightness})`,
      objectPosition: frameCropY === undefined ? "50% 50%" : frameCropPosition(frameCropY),
      clipPath: `inset(${highlight.box.top * 100}% ${(1 - highlight.box.right) * 100}% ${(1 - highlight.box.bottom) * 100}% ${highlight.box.left * 100}%)`,
      ...(highlight.style === "dim" ? { boxShadow: "0 0 0 9999px rgba(0,0,0,.58)" } : {
        transform: "scale(1.8)", transformOrigin: `${((highlight.box.left + highlight.box.right) / 2) * 100}% ${((highlight.box.top + highlight.box.bottom) / 2) * 100}%`,
      }),
    }} /> : null}
    {highlight?.box && highlight.style === "border" ? <div style={{ position: "absolute", left: `${highlight.box.left * 100}%`, top: `${highlight.box.top * 100}%`, width: `${(highlight.box.right - highlight.box.left) * 100}%`, height: `${(highlight.box.bottom - highlight.box.top) * 100}%`, border: `${highlight.width ?? 6}px solid ${highlight.color ?? "#FFFFFF"}`, borderRadius: 24, boxSizing: "border-box" }} /> : null}
    {highlight?.box && highlight.style === "dim" ? <div style={{ position: "absolute", left: `${highlight.box.left * 100}%`, top: `${highlight.box.top * 100}%`, width: `${(highlight.box.right - highlight.box.left) * 100}%`, height: `${(highlight.box.bottom - highlight.box.top) * 100}%`, border: `${highlight.width ?? 6}px solid ${highlight.color ?? "#FFFFFF"}`, boxShadow: "0 0 0 9999px rgba(0,0,0,.58)", borderRadius: 24, boxSizing: "border-box" }} /> : null}
    <div style={shadeStyle(shade)} />
    {texts.map(text => <div key={text.id} style={textObjectStyle(text, carouselCanvasSize(aspect))}>{text.text}</div>)}
    {logo?.enabled && logoUrl ? <Img src={logoUrl} style={logoStyle(logo, carouselCanvasSize(aspect))} /> : null}
  </AbsoluteFill>
);
