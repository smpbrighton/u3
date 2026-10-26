export const FONT_FAMILY = {
  body: "Pretendard",
  display: "Black Han Sans",
} as const;

export type FontRole = keyof typeof FONT_FAMILY;
export type CaptionFontKey = "pretendard" | "gmarket" | "tmon";
export const CAPTION_FONT_FAMILY: Record<CaptionFontKey, string> = { pretendard: FONT_FAMILY.body, gmarket: "Gmarket Sans", tmon: "TmonMonsori" };

export const FONT_FILES = [
  { role: "body", family: FONT_FAMILY.body, weight: "400", file: "fonts/Pretendard-Regular.otf" },
  { role: "body", family: FONT_FAMILY.body, weight: "700", key: "pretendard", file: "fonts/Pretendard-Bold.otf" },
  { role: "body", family: CAPTION_FONT_FAMILY.gmarket, weight: "700", key: "gmarket", file: "fonts/GmarketSansTTFBold.ttf" },
  { role: "body", family: CAPTION_FONT_FAMILY.tmon, weight: "400", key: "tmon", file: "fonts/TmonMonsori.otf" },
  { role: "display", family: FONT_FAMILY.display, weight: "400", file: "fonts/BlackHanSans-Regular.ttf" },
] as const;
