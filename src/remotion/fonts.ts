import { loadFont } from "@remotion/fonts";
import blackHanSansRegular from "../../assets/fonts/BlackHanSans-Regular.ttf";
import pretendardBold from "../../assets/fonts/Pretendard-Bold.otf";
import pretendardRegular from "../../assets/fonts/Pretendard-Regular.otf";
import gmarketBold from "../../assets/fonts/GmarketSansTTFBold.ttf";
import tmonMonsori from "../../assets/fonts/TmonMonsori.otf";
import { FONT_FILES } from "../core/fonts";

export { FONT_FAMILY, FONT_FILES } from "../core/fonts";

let pending: Promise<void> | null = null;
const FONT_URLS = [pretendardRegular, pretendardBold, gmarketBold, tmonMonsori, blackHanSansRegular];

export function ensureFonts(): Promise<void> {
  if (!pending) {
    pending = Promise.all(FONT_FILES.map((font, index) => loadFont({ family: font.family, weight: font.weight, url: FONT_URLS[index]! }))).then(() => undefined);
  }
  return pending;
}
