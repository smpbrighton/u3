import { useEffect, useState } from "react";
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


// loadFont는 delayRender로 렌더를 막지만 이미 계산한 React memo는 갱신하지 않는다.
export function useFontRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let loaded = false;
    const refresh = () => { if (active && loaded) setRevision(value => value + 1); };
    document.fonts.addEventListener("loadingdone", refresh);
    void ensureFonts().then(() => { loaded = true; refresh(); });
    return () => { active = false; document.fonts.removeEventListener("loadingdone", refresh); };
  }, []);
  return revision;
}
