import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, type CancelSignal, type RenderMediaProgress } from "@remotion/renderer";
import type { Input, Timeline } from "../../core/schema";
import { timelineToRender } from "../../core/timeline/to-render";
import type { U3ShortProps } from "../../remotion/types";

export const REMOTION_ENTRY = fileURLToPath(new URL("../../remotion/index.ts", import.meta.url));
const bundleCache = new Map<string, Promise<string>>();
const execFile = promisify(execFileCallback);

/** Remotion 번들을 한 번 생성하고 같은 asset 폴더에 대해 재사용한다. */
export function getBundle(assetsDir?: string): Promise<string> {
  const key = assetsDir ?? "";
  let pending = bundleCache.get(key);
  if (!pending) {
    pending = bundle({ entryPoint: REMOTION_ENTRY, ...(assetsDir ? { publicDir: assetsDir } : {}) });
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

function asUrl(file: string, root: string, resolveMediaUrl?: (absolutePath: string) => string): string {
  const resolved = resolvePath(file, root);
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
  const { stdout } = await execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration,r_frame_rate", "-of", "json", file]);
  const stream = (JSON.parse(stdout) as { streams?: { duration?: string; r_frame_rate?: string }[] }).streams?.[0];
  if (!stream?.duration || !stream.r_frame_rate) return 1;
  const [n, d] = stream.r_frame_rate.split("/").map(Number);
  return Math.max(1, Math.round(Number(stream.duration) * (n! / d!)));
}

export async function renderShort(options: RenderShortOptions) {
  const render = timelineToRender(options.timeline);
  const inputs = Object.fromEntries(options.inputs.map((input) => [input.id, input.url ?? asUrl(input.file, options.projectFolder, options.resolveMediaUrl)]));
  const inputKinds = Object.fromEntries(options.inputs.map((input) => [input.id, input.kind]));
  const memeIds = [...new Set(render.video.filter((item) => item.kind === "meme").map((item) => item.memeId!))];
  const memes = Object.fromEntries(await Promise.all(memeIds.map(async (id) => [id, asUrl(id, options.libraryFolder, options.resolveMediaUrl)] as const)));
  const memeFrames = Object.fromEntries(await Promise.all(memeIds.map(async (id) => [id, await videoFrames(resolvePath(id, options.libraryFolder))] as const)));
  const audio = render.audio.map((layer) => layer.file ? { ...layer, file: asUrl(layer.file, options.projectFolder, options.resolveMediaUrl) } : layer);
  const props: U3ShortProps = { render: { ...render, audio }, inputs, inputKinds, memes, memeFrames };
  const serveUrl = await getBundle();
  const executable = options.browserExecutable;
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
