import { SPAWN_OPTIONS } from "../spawn-options";
import { execFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

type MediaExecResult = { stdout: string | Buffer; stderr: string | Buffer };
type MediaExec = (file: string, args: string[], options: ExecFileOptions) => Promise<MediaExecResult>;
const execFileP = promisify(execFile) as MediaExec;

export function createMediaRunner(execute: MediaExec = execFileP) {
  return {
    run(file: string, args: string[], options: ExecFileOptions = {}) {
      return execute(file, args, { ...options, ...SPAWN_OPTIONS, cwd: path.dirname(path.resolve(file)) });
    },
  };
}

const mediaRunner = createMediaRunner();

export const FFMPEG = process.env.FFMPEG_BIN ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE_BIN ?? "ffprobe";

export async function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  await mediaRunner.run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
    signal,
  });
}

export interface ProbeStream {
  index: number;
  codec_type: "video" | "audio" | "data" | "subtitle" | string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_frames?: string;
  duration?: string;
  pix_fmt?: string;
  tags?: Record<string, string>;
}

export interface ProbeResult {
  streams: ProbeStream[];
  format: { duration?: string; format_name?: string };
}

export async function ffprobe(file: string): Promise<ProbeResult> {
  const { stdout } = await mediaRunner.run(
    FFPROBE,
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout.toString()) as ProbeResult;
}

export function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  if (!d) return n ?? 0;
  return (n ?? 0) / d;
}

export interface VideoSummary {
  width: number;
  height: number;
  fps: number;
  videoFrames: number;
  durationSec: number;
  audioStreams: number;
  videoCodec: string | null;
  audioCodec: string | null;
}

export async function summarizeVideo(file: string): Promise<VideoSummary> {
  const probe = await ffprobe(file);
  const video = probe.streams.find((s) => s.codec_type === "video");
  const audio = probe.streams.filter((s) => s.codec_type === "audio");
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseRate(video?.r_frame_rate),
    videoFrames: Number(video?.nb_frames ?? 0),
    durationSec: Number(probe.format.duration ?? video?.duration ?? 0),
    audioStreams: audio.length,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio[0]?.codec_name ?? null,
  };
}

/** 영상의 n번째(0부터) 프레임을 PNG로 뽑는다. */
export async function extractFrame(video: string, frameIndex: number, outPng: string): Promise<void> {
  await runFfmpeg(["-i", video, "-vf", `select=eq(n\\,${frameIndex})`, "-frames:v", "1", "-fps_mode", "passthrough", outPng]);
}

/** sec초 위치의 프레임 한 장(짤 가운데 프레임 등) */
export async function extractFrameAt(video: string, sec: number, outPng: string): Promise<void> {
  await runFfmpeg(["-ss", String(Math.max(0, sec)), "-i", video, "-frames:v", "1", outPng]);
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

/** 이미지 파일을 RGBA 원시 픽셀로 읽는다(ffmpeg 디코드, 추가 의존성 없음). */
export async function readRgba(file: string): Promise<RgbaImage> {
  const probe = await ffprobe(file);
  const v = probe.streams.find((s) => s.codec_type === "video");
  const width = v?.width ?? 0;
  const height = v?.height ?? 0;
  const { stdout } = await mediaRunner.run(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
  );
  const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (data.length !== width * height * 4) {
    throw new Error(`readRgba: 크기 불일치 ${file} (${data.length} != ${width}x${height}x4)`);
  }
  return { width, height, data };
}
