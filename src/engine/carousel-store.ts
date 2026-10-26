import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Carousel, CarouselSlide, type Carousel as CarouselData } from "../core/carousel";
import { HttpError } from "./http";

async function writeAtomic(file: string, data: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, data);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

type NewSlide = Omit<CarouselSlide, "image" | "error">;
type NewCarousel = { id?: string; name: string; topic: string; refinedTopic?: string; aspect: "4:5" | "1:1"; style: string; slides: NewSlide[] };
type UserSlideFields = Partial<Pick<CarouselSlide, "title" | "body" | "textPlacement" | "imagePrompt">>;
type EngineSlideFields = Partial<Pick<CarouselSlide, "image" | "status" | "error">>;

export class CarouselStore {
  private chains = new Map<string, Promise<unknown>>();
  readonly root: string;

  constructor(
    root = process.env.U3_DATA_DIR ?? path.join(os.homedir(), "Library/Application Support/U3"),
    private readonly hasActiveForCarousel: (id: string) => boolean = () => false,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.root = path.join(root, "carousels");
  }

  carouselDir(id: string): string { return path.join(this.root, id); }
  private file(id: string): string { return path.join(this.carouselDir(id), "carousel.json"); }

  private lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(id) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.chains.set(id, tail);
    void tail.then(() => { if (this.chains.get(id) === tail) this.chains.delete(id); });
    return run;
  }

  private async readRaw(id: string): Promise<CarouselData | null> {
    let raw: unknown;
    try { raw = JSON.parse(await readFile(this.file(id), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new HttpError(500, "broken-carousel", `carousel.json을 읽을 수 없습니다: ${id}`);
    }
    const parsed = Carousel.safeParse(raw);
    if (!parsed.success) throw new HttpError(500, "broken-carousel", `carousel.json 형식이 맞지 않습니다: ${id}`);
    return parsed.data.id === id ? parsed.data : null;
  }

  private async write(value: CarouselData): Promise<void> {
    await writeAtomic(this.file(value.id), `${JSON.stringify(value, null, 2)}\n`);
  }

  private async recover(value: CarouselData): Promise<CarouselData> {
    if (this.hasActiveForCarousel(value.id)) return value;
    const slides = value.slides.map(slide =>
      slide.status === "queued" || slide.status === "running"
        ? { ...slide, status: "failed" as const, error: "앱이 닫혀 중단됨" }
        : slide,
    );
    if (slides.every((slide, index) => slide === value.slides[index])) return value;
    const recovered = Carousel.parse({ ...value, slides, savedAt: this.now().toISOString() });
    await this.write(recovered);
    return recovered;
  }

  async getCarousel(id: string): Promise<CarouselData | null> {
    return this.lock(id, async () => {
      const value = await this.readRaw(id);
      return value ? this.recover(value) : null;
    });
  }

  async requireCarousel(id: string): Promise<CarouselData> {
    const value = await this.getCarousel(id);
    if (!value) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
    return value;
  }

  async listCarousels(): Promise<CarouselData[]> {
    await mkdir(this.root, { recursive: true });
    const folders = await readdir(this.root, { withFileTypes: true });
    const values: CarouselData[] = [];
    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      try { const value = await this.getCarousel(folder.name); if (value) values.push(value); }
      catch { /* 손상된 캐러셀은 목록에서 제외한다. */ }
    }
    return values.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
  }

  async createCarousel(input: NewCarousel): Promise<CarouselData> {
    const now = this.now();
    const id = input.id ?? `${now.getTime().toString(36)}-${randomBytes(4).toString("hex")}`;
    const value = Carousel.parse({ ...input, id, createdAt: now.toISOString(), savedAt: now.toISOString() });
    return this.lock(id, async () => {
      if (await this.readRaw(id)) throw new HttpError(409, "exists", `같은 id의 캐러셀이 있습니다: ${id}`);
      await mkdir(path.join(this.carouselDir(id), "images"), { recursive: true });
      await this.write(value);
      return value;
    });
  }

  async renameCarousel(id: string, name: string): Promise<CarouselData> {
    return this.updateCarouselFields(id, { name });
  }

  async updateCarouselFields(id: string, fields: { name?: string; topic?: string; refinedTopic?: string }): Promise<CarouselData> {
    return this.lock(id, async () => {
      const current = await this.readRaw(id);
      if (!current) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
      const next = Carousel.parse({ ...current, ...fields, savedAt: this.now().toISOString() });
      await this.write(next);
      return next;
    });
  }

  async replacePlan(id: string, plan: { topic: string; style: string; slides: Array<{ title: string; body: string; imagePrompt: string }> }): Promise<CarouselData> {
    return this.lock(id, async () => {
      const current = await this.readRaw(id);
      if (!current) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
      if (this.hasActiveForCarousel(id)) throw new HttpError(409, "active-job", "이미지 생성 중에는 기획을 바꿀 수 없습니다");
      const slides = current.slides.map((slide, index) => ({
        id: slide.id,
        title: plan.slides[index]!.title,
        body: plan.slides[index]!.body,
        imagePrompt: plan.slides[index]!.imagePrompt,
        textPlacement: slide.textPlacement,
        status: "idle" as const,
      }));
      const next = Carousel.parse({ ...current, topic: plan.topic, style: plan.style, slides, savedAt: this.now().toISOString() });
      await this.write(next);
      for (const slide of current.slides) if (slide.image?.file) await rm(path.join(this.carouselDir(id), slide.image.file), { force: true });
      return next;
    });
  }

  async updateSlideUserFields(id: string, slideId: string, fields: UserSlideFields): Promise<CarouselData> {
    return this.updateSlide(id, slideId, fields, false);
  }

  async updateSlideEngineFields(id: string, slideId: string, fields: EngineSlideFields): Promise<CarouselData> {
    return this.updateSlide(id, slideId, fields, true);
  }

  private async updateSlide(id: string, slideId: string, fields: UserSlideFields | EngineSlideFields, engine: boolean): Promise<CarouselData> {
    return this.lock(id, async () => {
      const current = await this.readRaw(id);
      if (!current) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
      const index = current.slides.findIndex(slide => slide.id === slideId);
      if (index < 0) throw new HttpError(404, "slide-not-found", `장이 없습니다: ${slideId}`);
      const currentSlide = current.slides[index]!;
      const allowed = engine
        ? { image: (fields as EngineSlideFields).image, status: (fields as EngineSlideFields).status, error: (fields as EngineSlideFields).error }
        : { title: (fields as UserSlideFields).title, body: (fields as UserSlideFields).body, textPlacement: (fields as UserSlideFields).textPlacement, imagePrompt: (fields as UserSlideFields).imagePrompt };
      const slide = CarouselSlide.parse({ ...currentSlide, ...Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined)) });
      const slides = current.slides.slice(); slides[index] = slide;
      const next = Carousel.parse({ ...current, slides, savedAt: this.now().toISOString() });
      await this.write(next);
      return next;
    });
  }

  async saveImageVersion(id: string, slideId: string, png: Buffer): Promise<CarouselData> {
    if (!/^[A-Za-z0-9_-]+$/.test(slideId)) throw new HttpError(400, "invalid-slide-id", "slide id가 파일 이름에 쓸 수 없습니다");
    return this.lock(id, async () => {
      const current = await this.readRaw(id);
      if (!current) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
      const index = current.slides.findIndex(slide => slide.id === slideId);
      if (index < 0) throw new HttpError(404, "slide-not-found", `장이 없습니다: ${slideId}`);
      const old = current.slides[index]!.image;
      const version = (old?.version ?? 0) + 1;
      const relative = `images/${slideId}-${version}.png`;
      await writeAtomic(path.join(this.carouselDir(id), relative), png);
      const slides = current.slides.slice();
      slides[index] = CarouselSlide.parse({ ...slides[index], image: { file: relative, version }, status: "done", error: undefined });
      const next = Carousel.parse({ ...current, slides, savedAt: this.now().toISOString() });
      await this.write(next);
      if (old?.file) await rm(path.join(this.carouselDir(id), old.file), { force: true });
      return next;
    });
  }

  async deleteCarousel(id: string): Promise<void> {
    await this.lock(id, async () => {
      if (this.hasActiveForCarousel(id)) throw new HttpError(409, "active-job", "생성 중인 캐러셀은 삭제할 수 없습니다");
      if (!(await this.readRaw(id))) throw new HttpError(404, "not-found", `캐러셀이 없습니다: ${id}`);
      await rm(this.carouselDir(id), { recursive: true, force: false });
    });
  }
}
