import { z } from "zod";

export const CarouselImage = z.object({ file: z.string().min(1), version: z.number().int().positive() });
export const CarouselSlide = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  textPlacement: z.enum(["top", "center", "bottom"]),
  imagePrompt: z.string(),
  image: CarouselImage.optional(),
  status: z.enum(["queued", "running", "done", "failed", "idle"]),
  error: z.string().optional(),
});
export type CarouselSlide = z.infer<typeof CarouselSlide>;

export const Carousel = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  topic: z.string(),
  refinedTopic: z.string().optional(),
  aspect: z.enum(["4:5", "1:1"]),
  style: z.string(),
  slides: z.array(CarouselSlide),
  createdAt: z.string().datetime(),
  savedAt: z.string().datetime(),
});
export type Carousel = z.infer<typeof Carousel>;

/** 운영체제 경로에 쓸 캐러셀 폴더 이름을 만든다. */
export function carouselFolderName(name: string): string {
  if (!name.trim()) return "캐러셀";
  const cleaned = name.replace(/[\/\\:\x00-\x1f\x7f]/g, "-").trim();
  return cleaned || "캐러셀";
}

/** 같은 이름 폴더가 있으면 비어 있는 번호를 뒤에 붙인다. */
export function nextCarouselFolderName(name: string, existing: Iterable<string>): string {
  const base = carouselFolderName(name);
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}

/** 받는 순서의 0 기반 위치를 01.png 형식으로 바꾼다. */
export function receivedSlideFileName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("받는 장 번호는 0 이상의 정수여야 합니다");
  return `${String(index + 1).padStart(2, "0")}.png`;
}
