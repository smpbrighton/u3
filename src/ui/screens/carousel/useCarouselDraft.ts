import { useEffect, useRef, useState } from "react";
import type { Carousel, CarouselSlide } from "../../../core/carousel";
import { api } from "../../api";
import { useBeforeUpdateRestart } from "../../update-save";

export type SlidePatch = Partial<Pick<CarouselSlide, "texts" | "logo" | "brightness" | "shade" | "sceneNumber" | "imagePrompt">> & {
  background?: { sec?: number; cropY?: number; highlight?: { target?: string; color?: string; width?: number; box?: import("../../../core/carousel").CarouselBox } };
};
type Fields = Partial<Pick<Carousel, "caption" | "style">>;
function mergePatch(a: SlidePatch, b: SlidePatch): SlidePatch {
  return { ...a, ...b, ...(a.background || b.background ? { background: { ...a.background, ...b.background, ...(a.background?.highlight || b.background?.highlight ? { highlight: { ...a.background?.highlight, ...b.background?.highlight } } : {}) } } : {}) };
}
function applySlide(slide: CarouselSlide, patch: SlidePatch): CarouselSlide {
  return { ...slide, ...patch, background: slide.background.kind === "frame" ? { ...slide.background, ...patch.background, highlight: patch.background?.highlight ? { style: "none", target: "", ...slide.background.highlight, ...patch.background.highlight } : slide.background.highlight } : slide.background };
}

/** 저장을 직렬화하고 작업 상태 갱신에서 미저장 입력을 보존한다. */
export function useCarouselDraft(carousel: Carousel, onUpdate: (value: Carousel) => void) {
  const [draft, setDraft] = useState(carousel);
  const saved = useRef(carousel);
  const pending = useRef(new Map<string, SlidePatch>());
  const fields = useRef<Fields>({});
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function rebase(value: Carousel) {
    if (value.savedAt < saved.current.savedAt) return;
    saved.current = value;
    setDraft({ ...value, ...fields.current, slides: value.slides.map(slide => applySlide(slide, pending.current.get(slide.id) ?? {})) });
  }
  useEffect(() => { rebase(carousel); }, [carousel]);
  function changeSlide(id: string, patch: SlidePatch) {
    pending.current.set(id, mergePatch(pending.current.get(id) ?? {}, patch));
    rebase(saved.current);
  }
  function changeFields(patch: Fields) { fields.current = { ...fields.current, ...patch }; rebase(saved.current); }
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.current.then(work);
    queue.current = result.catch(() => undefined);
    return result;
  }
  function accept(value: Carousel) { rebase(value); onUpdate(value); return value; }
  function saveSlide(id: string) {
    return enqueue(async () => {
      const patch = pending.current.get(id);
      if (!patch) return saved.current;
      const value = await api<Carousel>("PATCH", `/api/carousels/${encodeURIComponent(carousel.id)}/slides/${encodeURIComponent(id)}`, patch);
      if (pending.current.get(id) === patch) pending.current.delete(id);
      return accept(value);
    });
  }
  function saveFields() {
    return enqueue(async () => {
      const patch = fields.current;
      if (!Object.keys(patch).length) return saved.current;
      const value = await api<Carousel>("PATCH", `/api/carousels/${encodeURIComponent(carousel.id)}`, patch);
      if (fields.current === patch) fields.current = {};
      return accept(value);
    });
  }
  async function flush() {
    while (pending.current.size) await saveSlide(pending.current.keys().next().value!);
    do { await saveFields(); } while (Object.keys(fields.current).length);
  }
  async function mutate(work: () => Promise<Carousel>) { await flush(); return enqueue(async () => accept(await work())); }
  function getSlide(id: string) {
    const slide = saved.current.slides.find(slide => slide.id === id);
    return slide ? applySlide(slide, pending.current.get(id) ?? {}) : undefined;
  }
  useBeforeUpdateRestart(flush);
  return { draft, changeSlide, changeFields, saveSlide, saveFields, flush, mutate, accept, getSlide };
}
