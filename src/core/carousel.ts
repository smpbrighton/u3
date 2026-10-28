import { z } from "zod";

export const CarouselImage = z.object({ file: z.string().min(1), version: z.number().int().positive().optional() });
export const CarouselBox = z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) })
  .refine(box => box.left < box.right && box.top < box.bottom, "상자 좌표가 올바르지 않습니다");
export type CarouselBox = z.infer<typeof CarouselBox>;

export const CarouselSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topic") }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1), projectName: z.string().min(1), durationSec: z.number().min(0).optional() }),
]);
const GeneratedBackground = z.object({ kind: z.literal("generated"), image: CarouselImage.optional() });
const FrameHighlight = z.object({
  style: z.enum(["none", "border", "dim", "zoom", "ai-outline"]),
  target: z.string().default(""),
  box: CarouselBox.optional(),
  boxManual: z.boolean().optional(),
  color: z.string().optional(),
  width: z.number().positive().max(100).optional(),
  image: CarouselImage.optional(),
});
const FrameBackground = z.object({
  kind: z.literal("frame"), sec: z.number().min(0), cropY: z.number().min(0).max(1),
  frame: CarouselImage.optional(), highlight: FrameHighlight.optional(),
  status: z.enum(["queued", "running", "done", "failed", "idle"]).default("idle"), error: z.string().optional(),
});
export const CarouselBackground = z.discriminatedUnion("kind", [GeneratedBackground, FrameBackground]);
export type CarouselBackground = z.infer<typeof CarouselBackground>;
export type CarouselAspect = "4:5" | "1:1" | "9:16" | "16:9";
const ratio = z.number().min(0).max(1);
export const CarouselTextObject = z.object({
  id: z.string().min(1), role: z.enum(["title", "body", "extra"]), text: z.string().max(5000),
  x: ratio, y: ratio, width: ratio, font: z.enum(["pretendard", "gmarket", "tmon"]),
  weight: z.union([z.literal(400), z.literal(700)]), fontSize: z.number().min(12).max(200),
  color: z.string(), align: z.enum(["left", "center", "right"]),
  effect: z.enum(["none", "shadow", "bar", "outline"]), barColor: z.string().optional(), opacity: ratio,
}).refine(text => text.font === "pretendard" || text.weight === (text.font === "gmarket" ? 700 : 400), "앱에 없는 폰트 굵기입니다");
export type CarouselTextObject = z.infer<typeof CarouselTextObject>;
export const CarouselTexts = z.array(CarouselTextObject).min(2).max(5).refine(texts =>
  texts.filter(t => t.role === "title").length === 1 && texts.filter(t => t.role === "body").length === 1 &&
  new Set(texts.map(t => t.id)).size === texts.length, "제목·본문과 고유한 글 id가 필요합니다");
export const CarouselLogo = z.object({
  enabled: z.boolean(), x: ratio, y: ratio, width: ratio, opacity: ratio,
  file: z.string().regex(/^logos\/logo\.(png|jpg|webp)$/),
});
export type CarouselLogo = z.infer<typeof CarouselLogo>;

export function defaultTexts(aspect: CarouselAspect): CarouselTextObject[] {
  return [
    { id: "title", role: "title", text: "", x: 0.08, y: 0.09, width: 0.84, font: "pretendard", weight: 700, fontSize: 76, color: "#FFFFFF", align: "left", effect: "shadow", opacity: 1 },
    { id: "body", role: "body", text: "", x: aspect === "16:9" ? 0.2 : 0.08, y: 0.19, width: aspect === "16:9" ? 0.6 : 0.84, font: "pretendard", weight: 400, fontSize: 40, color: "#FFFFFF", align: "left", effect: "shadow", opacity: 1 },
  ];
}

/** 레거시 입력의 위치를 고정 좌표로 바꾼다. 저장 스키마에는 레거시 키를 두지 않는다. */
export function textsFromLegacy(slide: { title?: unknown; body?: unknown; textPlacement?: unknown }, aspect: CarouselAspect): CarouselTextObject[] {
  const texts = defaultTexts(aspect);
  const y = slide.textPlacement === "center" ? 0.40 : slide.textPlacement === "bottom" ? 0.62 : 0.09;
  return texts.map((text, index) => ({
    ...text, text: typeof (index === 0 ? slide.title : slide.body) === "string" ? (index === 0 ? slide.title : slide.body) as string : "",
    y: y + (index === 0 ? 0 : 0.1),
  }));
}

export const CarouselSlide = z.object({
  id: z.string().min(1), texts: CarouselTexts, logo: CarouselLogo.optional(),
  brightness: z.number().min(0.2).max(2).default(1), shade: z.number().min(0).max(0.9).default(0.35),
  sceneNumber: z.number().int().positive().optional(),
  imagePrompt: z.string().default(""), background: CarouselBackground,
  image: CarouselImage.optional(), status: z.enum(["queued", "running", "done", "failed", "idle"]).default("idle"), error: z.string().optional(),
});
export type CarouselSlide = z.infer<typeof CarouselSlide>;

export function newSlide(source: z.infer<typeof CarouselSource>, previous?: CarouselSlide): CarouselSlide {
  return CarouselSlide.parse({
    id: previous ? `${previous.id}-next` : "slide-1", texts: defaultTexts("4:5"),
    ...(source.kind === "project" ? { sceneNumber: previous?.sceneNumber ?? 1 } : {}),
    background: source.kind === "project"
      ? { kind: "frame", sec: previous?.background.kind === "frame" ? previous.background.sec : 0, cropY: 0.5, highlight: { style: "none", target: "" } }
      : { kind: "generated" },
  });
}

const CarouselBase = z.object({
  id: z.string().min(1), name: z.string().min(1), source: CarouselSource,
  topic: z.string().optional(), refinedTopic: z.string().optional(), aspect: z.enum(["4:5", "1:1", "9:16", "16:9"]), style: z.string().optional(),
  stage: z.enum(["review", "images"]).default("images"), caption: z.string().max(2000).default(""),
  slides: z.array(CarouselSlide), createdAt: z.string().datetime(), savedAt: z.string().datetime(),
});
export const Carousel = z.preprocess(raw => {
  if (!raw || typeof raw !== "object") return raw;
  const value = raw as Record<string, unknown>;
  const aspect = value.aspect as CarouselAspect;
  const slides = Array.isArray(value.slides) ? value.slides.map(item => {
    if (!item || typeof item !== "object") return item;
    const slide = item as Record<string, unknown>;
    return { ...slide, texts: slide.texts ?? textsFromLegacy(slide, aspect),
      background: slide.background ?? { kind: "generated", ...(slide.image ? { image: slide.image } : {}) } };
  }) : value.slides;
  return { ...value, source: value.source ?? { kind: "topic" }, slides };
}, CarouselBase.superRefine((value, ctx) => {
  if (value.source.kind === "topic" && value.topic === undefined) ctx.addIssue({ code: "custom", path: ["topic"], message: "topic 캐러셀에는 주제가 필요합니다" });
  if (value.source.kind === "project") value.slides.forEach((slide, index) => {
    if (slide.background.kind !== "frame") ctx.addIssue({ code: "custom", path: ["slides", index, "background"], message: "project 캐러셀은 frame 배경이 필요합니다" });
  });
}));
export type Carousel = z.infer<typeof Carousel>;

/** 운영체제 경로에 쓸 캐러셀 폴더 이름을 만든다. */
export function carouselFolderName(name: string): string {
  if (!name.trim()) return "캐러셀";
  const cleaned = name.replace(/[\/\\:\x00-\x1f\x7f]/g, "-").trim();
  return cleaned || "캐러셀";
}
/** 같은 이름 폴더가 있으면 비어 있는 번호를 뒤에 붙인다. */
export function nextCarouselFolderName(name: string, existing: Iterable<string>): string {
  const base = carouselFolderName(name); const used = new Set(existing);
  if (!used.has(base)) return base;
  let number = 2; while (used.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}
/** 받는 순서의 0 기반 위치를 01.png 형식으로 바꾼다. */
export function receivedSlideFileName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("받는 장 번호는 0 이상의 정수여야 합니다");
  return `${String(index + 1).padStart(2, "0")}.png`;
}
