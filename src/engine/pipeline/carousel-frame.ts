import { mkdir } from "node:fs/promises";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { Timeline } from "../../core/schema";
import { sourceAtTimelineSec } from "../../core/carousel-frame";
import { timelineToRender } from "../../core/timeline/to-render";
import { asUrl, getBundle, type RenderInput } from "./render";
import type { U3ShortProps } from "../../remotion/types";

/** 원본 프로젝트의 한 시각을 1080×1920 PNG로 뽑는다. 자막·겹친 영상·브랜드는 합성하지 않는다. */
export async function renderCarouselFrame(options: {
  timeline: Timeline; inputs: readonly RenderInput[]; projectFolder: string; libraryFolder: string;
  sec: number; outputPath: string; browserExecutable?: string; resolveMediaUrl?: (file: string) => string;
}): Promise<void> {
  const source = sourceAtTimelineSec(options.timeline, options.sec);
  if (!source) throw new Error("선택한 시각에 영상 1 본 화면 프레임이 없습니다");
  const sourceEnd = "durationSec" in source.clip ? source.clip.durationSec : source.clip.inEndSec;
  const duration = Math.min(0.1, Math.max(0.001, sourceEnd - source.sourceSec));
  const singleTimeline = Timeline.parse({
    video: [{ ...source.clip, id: "carousel-frame", inStartSec: source.sourceSec, inEndSec: source.sourceSec + duration, startTransition: { kind: { kind: "none" }, durationSec: 0.5 }, endTransition: { kind: { kind: "none" }, durationSec: 0.5 } }],
    overlays: [], captions: [], captionLayers: [], voice: [], sfx: [], brand: undefined,
    audio: options.timeline.audio,
  });
  const render = timelineToRender(singleTimeline);
  const inputs = Object.fromEntries(options.inputs.map(input => [(input as RenderInput).id, (input as RenderInput).url ?? asUrl(input.file, options.projectFolder, options.resolveMediaUrl, options.libraryFolder)]));
  const inputKinds = Object.fromEntries(options.inputs.map(input => [input.id, input.kind]));
  const props: U3ShortProps = { render, inputs, inputKinds, memes: {}, overlayInputs: {}, memeFrames: {} };
  const serveUrl = await getBundle();
  const executable = options.browserExecutable ?? process.env.U3_CHROME_EXECUTABLE;
  const composition = await selectComposition({ serveUrl, id: "U3Short", inputProps: props, ...(executable ? { browserExecutable: executable } : {}) });
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await renderStill({ serveUrl, composition, inputProps: props, frame: 0, output: options.outputPath, imageFormat: "png", licenseKey: "free-license", ...(executable ? { browserExecutable: executable } : {}) });
}

