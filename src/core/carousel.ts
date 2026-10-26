import { z } from "zod";

export const CarouselImage = z.object({ file: z.string().min(1), version: z.number().int().positive().optional() });
export const CarouselBox = z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) })
  .refine(box => box.left < box.right && box.top < box.bottom, "상자 좌표가 올바르지 않습니다");
export type CarouselBox = z.infer<typeof CarouselBox>;

export const CarouselSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topic") }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1), projectName: z.string().min(1) }),
]);
const GeneratedBackground = z.object({ kind: z.literal("generated"), image: CarouselImage.optional() });
const FrameHighlight = z.object({
  style: z.enum(["border", "dim", "zoom", "ai-outline"]),
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
export const CarouselSlide = z.object({
  id: z.string().min(1), title: z.string(), body: z.string(), textPlacement: z.enum(["top", "center", "bottom"]),
  sceneNumber: z.number().int().positive().optional(),
  imagePrompt: z.string().default(""),
  background: CarouselBackground,
  // 030 호환 필드. legacy 캐러셀을 읽고 기존 화면에서 계속 편집할 수 있게 유지한다.
  image: CarouselImage.optional(), status: z.enum(["queued", "running", "done", "failed", "idle"]).default("idle"), error: z.string().optional(),
});
export type CarouselSlide = z.infer<typeof CarouselSlide>;

const CarouselBase = z.object({
  id: z.string().min(1), name: z.string().min(1), source: CarouselSource,
  topic: z.string().optional(), refinedTopic: z.string().optional(), aspect: z.enum(["4:5", "1:1"]), style: z.string().optional(),
  slides: z.array(CarouselSlide), createdAt: z.string().datetime(), savedAt: z.string().datetime(),
});
export const Carousel = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const value = raw as Record<string, unknown>;
  const slides = Array.isArray(value.slides) ? value.slides.map(item => {
    if (!item || typeof item !== "object") return item;
    const slide = item as Record<string, unknown>;
    if (slide.background) return slide;
    const image = slide.image;
    return { ...slide, background: { kind: "generated", ...(image ? { image } : {}) } };
  }) : value.slides;
  return { ...value, source: value.source ?? { kind: "topic" }, slides };
}, CarouselBase.superRefine((value, ctx) => {
  if (value.source.kind === "topic") {
    if (value.topic === undefined) ctx.addIssue({ code: "custom", path: ["topic"], message: "topic 캐러셀에는 주제가 필요합니다" });
    if (value.style === undefined) ctx.addIssue({ code: "custom", path: ["style"], message: "topic 캐러셀에는 style이 필요합니다" });
    value.slides.forEach((slide, index) => {
    });
  } else {
    value.slides.forEach((slide, index) => {
      if (slide.background.kind !== "frame") ctx.addIssue({ code: "custom", path: ["slides", index, "background"], message: "project 캐러셀은 frame 배경이 필요합니다" });
    });
  }
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
