import { mkdir } from "node:fs/promises";
import path from "node:path";
import { FFPROBE, runFfmpeg, createMediaRunner } from "./ffmpeg";

const mediaRunner = createMediaRunner();
export const frameCountForInputs = (count: number) => Math.min(40, Math.max(0, count) * 10);

/** 사진은 한 장씩 예약한다. 영상은 같은 장수에서 비율로 줄이고 각 영상에 세 장을 보장한다. */
export function frameAllocation(videoCount: number, photoCount = 0, limit = 40): number[] {
  const videoBudget = limit - photoCount;
  if (videoCount < 0 || photoCount < 0 || videoBudget < 0 || videoCount * 3 > videoBudget) {
    throw new RangeError("사진과 영상의 최소 프레임 수가 40장을 넘습니다");
  }
  if (videoCount === 0) return [];
  const framesPerVideo = Math.min(10, Math.floor(videoBudget / videoCount));
  const extraFrames = framesPerVideo < 10
    ? Math.min(videoCount, videoBudget - framesPerVideo * videoCount)
    : 0;
  return Array.from({ length: videoCount }, (_, index) =>
    framesPerVideo + (index < extraFrames ? 1 : 0),
  );
}

async function durationOf(file: string): Promise<number> {
  const { stdout } = await mediaRunner.run(FFPROBE, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 15_000 });
  return Number(stdout.toString().trim()) || 0;
}

export async function extractFrames(
  input: string,
  outputDirectory: string,
  count = 10,
  signal?: AbortSignal,
  photo = false,
): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const duration = photo ? 0 : await durationOf(input);
  const still = photo || duration === 0;
  const frameCount = still ? 1 : count;
  const output: string[] = [];
  for (let index = 0; index < frameCount; index++) {
    const file = path.join(outputDirectory, `frame-${String(index + 1).padStart(2, "0")}.jpg`);
    const second = still ? 0 : ((index + 0.5) / frameCount) * duration;
    await runFfmpeg([
      ...(still ? [] : ["-ss", String(second)]), "-i", input, "-frames:v", "1",
      "-vf", "scale='if(gte(iw,ih),768,-2)':'if(gte(iw,ih),-2,768)'",
      "-q:v", "3", file,
    ], signal);
    output.push(file);
  }
  return output;
}

export async function extractThumbnail(input: string, output: string, signal?: AbortSignal): Promise<string> {
  await mkdir(path.dirname(output), { recursive: true });
  await runFfmpeg([
    "-i", input, "-frames:v", "1",
    "-vf", "scale='if(gte(iw,ih),768,-2)':'if(gte(iw,ih),-2,768)'",
    "-q:v", "3", output,
  ], signal);
  return output;
}
