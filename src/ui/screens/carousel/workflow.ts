import type { Carousel, CarouselAspect, CarouselSlide } from "../../../core/carousel";
import type { Project } from "../../../core/schema";
import { api } from "../../api";

export type CarouselRequest = { count: number; aspect: CarouselAspect } & (
  { kind: "topic"; topic: string; style: string } | { kind: "project"; projectId: string }
);

export async function requestCarouselPlan(input: CarouselRequest, request: typeof api = api, onCreated?: (carousel: Carousel) => void): Promise<Carousel> {
  if (input.kind === "project") {
    const result = await request<{ carousel: Carousel }>("POST", `/api/projects/${encodeURIComponent(input.projectId)}/carousel`, { count: input.count, aspect: input.aspect });
    return result.carousel;
  }
  const value = await request<Carousel>("POST", "/api/carousels", { topic: input.topic, slideCount: input.count, aspect: input.aspect, style: input.style });
  onCreated?.(value);
  return request<Carousel>("POST", `/api/carousels/${encodeURIComponent(value.id)}/plan`, {});
}

export async function eligibleProjects(): Promise<Project[]> {
  const projects = await api<Project[]>("GET", "/api/projects");
  const checked = await Promise.all(projects.filter(project => project.timeline.video.some(clip => clip.kind === "main") && project.inputs.some(input => input.id !== "placeholder" && input.kind === "video"))
    .map(async project => {
      const script = await api<{ scenes: unknown[] } | null>("GET", `/api/projects/${encodeURIComponent(project.id)}/script`);
      return script?.scenes.length ? project : null;
    }));
  return checked.filter((project): project is Project => project !== null);
}

export function slideStatus(slide: CarouselSlide) { return slide.background.kind === "frame" ? slide.background.status : slide.status; }
export function slideImage(slide: CarouselSlide) {
  return slide.background.kind === "frame"
    ? (slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame)
    : slide.background.image ?? slide.image;
}
export function statusLabel(slide: CarouselSlide) {
  if (slide.error === "지시문 없음") return "지시문 없음";
  return { queued: "대기", running: "생성 중", done: "완료", failed: "실패", idle: "대기" }[slideStatus(slide)];
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
