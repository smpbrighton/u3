import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMedia, renderStill, selectComposition, type CancelSignal, type RenderMediaProgress } from "@remotion/renderer";
import type { BrandSettings, Input, Timeline } from "../../core/schema";
import { libraryReferencePath } from "../../core/library-reference";
import { timelineToRender } from "../../core/timeline/to-render";
import type { U3ShortProps } from "../../remotion/types";
import type { Carousel, CarouselSlide } from "../../core/carousel";
import { carouselHighlightInput } from "../../remotion/carousel-layout";
import { createMediaRunner, FFPROBE } from "./ffmpeg";
import { listMemes } from "./library";

export const REMOTION_ENTRY = fileURLToPath(new URL("../../remotion/index.ts", import.meta.url));
export const DEFAULT_ASSETS_DIR = fileURLToPath(new URL("../../../assets/", import.meta.url));
const bundleCache = new Map<string, Promise<string>>();
const mediaRunner = createMediaRunner();

/** Remotion 번들을 한 번 생성하고 같은 asset 폴더에 대해 재사용한다. */
export async function getBundle(assetsDir?: string): Promise<string> {
  const packagedBundle = process.env.U3_REMOTION_BUNDLE;
  if (packagedBundle) return Promise.resolve(packagedBundle);
  const publicDir = assetsDir ?? DEFAULT_ASSETS_DIR;
  const key = publicDir;
  let pending = bundleCache.get(key);
  if (!pending) {
    const { bundle } = await import("@remotion/bundler");
    pending = bundle({ entryPoint: REMOTION_ENTRY, publicDir });
    bundleCache.set(key, pending);
    pending.catch(() => bundleCache.delete(key));
  }
  return pending;
}

export interface RenderInput extends Input {
  /** media-server에서 제공한 URL. 없으면 file 경로를 Remotion props에 전달한다. */
  url?: string;
}

export interface RenderShortOptions {
  timeline: Timeline;
  brand?: BrandSettings;
  inputs: readonly RenderInput[];
  projectFolder: string;
  libraryFolder: string;
  outputPath: string;
  onProgress?: (progress: RenderMediaProgress) => void;
  signal?: AbortSignal;
  browserExecutable?: string;
  /** media-server가 준비되면 각 실제 파일 경로를 접근 가능한 URL로 바꾼다. */
  resolveMediaUrl?: (absolutePath: string) => string;
}

function resolvePath(file: string, root: string): string {
  if (/^(https?:|data:|file:)/i.test(file) || path.isAbsolute(file)) return file;
  return path.resolve(root, file);
}

export function asUrl(
  file: string,
  root: string,
  resolveMediaUrl?: (absolutePath: string) => string,
  libraryRoot = root,
): string {
  const libraryRelative = libraryReferencePath(file);
  const resolved = libraryRelative ? path.resolve(libraryRoot, libraryRelative) : resolvePath(file, root);
  if (/^(https?:|data:|file:)/i.test(resolved)) return resolved;
  return resolveMediaUrl ? resolveMediaUrl(resolved) : resolved;
}

function abortSignal(signal?: AbortSignal): CancelSignal | undefined {
  if (!signal) return undefined;
  return (callback) => {
    if (signal.aborted) callback();
    else signal.addEventListener("abort", callback, { once: true });
  };
}

async function videoFrames(file: string): Promise<number> {
  const { stdout } = await mediaRunner.run(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration,r_frame_rate", "-of", "json", file]);
  const stream = (JSON.parse(stdout.toString()) as { streams?: { duration?: string; r_frame_rate?: string }[] }).streams?.[0];
  if (!stream?.duration || !stream.r_frame_rate) return 1;
  const [n, d] = stream.r_frame_rate.split("/").map(Number);
  return Math.max(1, Math.round(Number(stream.duration) * (n! / d!)));
}

export async function resolveMemeFiles(ids: readonly string[], libraryFolder: string): Promise<Record<string, string>> {
  const memes = await listMemes(libraryFolder);
  const byId = new Map(memes.map(meme => [meme.id, meme.file]));
  return Object.fromEntries(ids.map(id => {
    const file = byId.get(id);
    if (!file) throw new Error(`짤을 라이브러리에서 찾을 수 없습니다: ${id}`);
    return [id, file];
  }));
}

export async function renderShort(options: RenderShortOptions) {
  const brandRoot = path.resolve(options.projectFolder, "../../brand");
  const brand = options.brand?.watermark?.file
    ? { ...options.brand, watermark: { ...options.brand.watermark, file: options.resolveMediaUrl?.(path.resolve(brandRoot, options.brand.watermark.file)) ?? path.resolve(brandRoot, options.brand.watermark.file) } }
    : options.brand;
  const render = timelineToRender(options.timeline, brand);
  const inputs = Object.fromEntries(options.inputs.map((input) => [input.id, input.url ?? asUrl(input.file, options.projectFolder, options.resolveMediaUrl)]));
  const inputKinds = Object.fromEntries(options.inputs.map((input) => [input.id, input.kind]));
  const memeIds = [...new Set([...render.video.filter((item) => item.kind === "meme").map((item) => item.memeId!), ...render.overlay.filter((item) => item.kind === "meme").map((item) => item.memeId!)])];
  const memeFiles = await resolveMemeFiles(memeIds, options.libraryFolder);
  const memes = Object.fromEntries(memeIds.map(id => [id, asUrl(memeFiles[id]!, options.libraryFolder, options.resolveMediaUrl)]));
  const memeFrames = Object.fromEntries(await Promise.all(memeIds.map(async (id) => [id, await videoFrames(memeFiles[id]!)] as const)));
  const audio = render.audio.map((layer) => layer.file ? { ...layer, file: asUrl(layer.file, options.projectFolder, options.resolveMediaUrl, options.libraryFolder) } : layer);
  const overlayInputs = Object.fromEntries(render.overlay.filter((item) => item.inputId).map((item) => [item.inputId!, inputs[item.inputId!]!]));
  const props: U3ShortProps = { render: { ...render, audio }, inputs, inputKinds, memes, overlayInputs, memeFrames };
  const serveUrl = await getBundle();
  const executable = options.browserExecutable ?? process.env.U3_CHROME_EXECUTABLE;
  const composition = await selectComposition({ serveUrl, id: "U3Short", inputProps: props, ...(executable ? { browserExecutable: executable } : {}) });
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: options.outputPath,
    inputProps: props,
    licenseKey: "free-license",
    onProgress: options.onProgress,
    cancelSignal: abortSignal(options.signal),
    ...(executable ? { browserExecutable: executable } : {}),
  });
  return composition;
}

/** 미리보기와 같은 CarouselSlide Composition으로 캐러셀의 최종 PNG를 만든다. */
export async function renderCarouselSlide(options: {
  carousel: Carousel;
  slide: CarouselSlide;
  imageUrl: string;
  outputPath: string;
  browserExecutable?: string;
}) {
  const background = options.slide.background;
  const hasImage = background.kind === "generated" ? !!(background.image ?? options.slide.image) : !!(background.highlight?.style === "ai-outline" ? background.highlight.image : background.frame);
  if (!hasImage) throw new Error("프레임 또는 이미지가 준비되지 않은 장입니다");
  const props = {
    imageUrl: options.imageUrl,
    title: options.slide.title,
    body: options.slide.body,
    textPlacement: options.slide.textPlacement,
    aspect: options.carousel.aspect,
    ...(background.kind === "frame" ? {
      frameCropY: background.cropY,
      ...(carouselHighlightInput(background.highlight) ? { highlight: carouselHighlightInput(background.highlight) } : {}),
    } : {}),
  };
  const serveUrl = await getBundle();
  const executable = options.browserExecutable ?? process.env.U3_CHROME_EXECUTABLE;
  const composition = await selectComposition({ serveUrl, id: "CarouselSlide", inputProps: props, ...(executable ? { browserExecutable: executable } : {}) });
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await renderStill({ serveUrl, composition, inputProps: props, output: options.outputPath, imageFormat: "png", licenseKey: "free-license", ...(executable ? { browserExecutable: executable } : {}) });
  return composition;
}
