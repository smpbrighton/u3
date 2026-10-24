export const FONT_FAMILY = {
  body: "Pretendard",
  display: "Black Han Sans",
} as const;

export type FontRole = keyof typeof FONT_FAMILY;

export const FONT_FILES = [
  { role: "body", family: FONT_FAMILY.body, weight: "400", file: "fonts/Pretendard-Regular.otf" },
  { role: "body", family: FONT_FAMILY.body, weight: "700", file: "fonts/Pretendard-Bold.otf" },
  { role: "display", family: FONT_FAMILY.display, weight: "400", file: "fonts/BlackHanSans-Regular.ttf" },
] as const;
