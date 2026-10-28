import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Input } from "../../core/schema";
import { inputDisplayName } from "../../core/input";
import { FFPROBE, ffprobe, runFfmpeg, createMediaRunner } from "./ffmpeg";

const mediaRunner = createMediaRunner();
type FrameInput = Pick<Input, "kind" | "durationSec">;

/** 입력 순서대로 사진은 1장, 영상은 초당 1장을 올림해 3–10장씩 배정한다. 전체 상한은 없다. */
export function frameAllocation(inputs: readonly FrameInput[]): number[] {
  return inputs.map(input => input.kind === "photo" ? 1 : Math.min(10, Math.max(3, Math.ceil(input.durationSec ?? 0))));
}

export function frameCountForInputs(inputs: readonly FrameInput[]): number {
  return frameAllocation(inputs).reduce((total, count) => total + count, 0);
}

/** 미디어 화면과 대본 생성이 같은 길이로 프레임 수를 계산한다. 저장 형식은 바꾸지 않는다. */
export async function frameInputsWithDuration(inputs: readonly Input[], projectDirectory: string): Promise<Input[]> {
  return Promise.all(inputs.filter(input => input.id !== "placeholder").map(async input => {
    if (input.kind !== "video" || input.durationSec !== undefined) return input;
    const durationSec = Number((await ffprobe(path.resolve(projectDirectory, input.file))).format.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error(`${inputDisplayName(input)}의 영상 길이를 확인할 수 없습니다.`);
    return { ...input, durationSec };
  }));
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
  const stale = (await readdir(outputDirectory, { withFileTypes: true })).filter(entry =>
    entry.isFile() && /^frame-\d+\.jpg$/.test(entry.name) && Number(entry.name.slice(6, -4)) > frameCount,
  );
  await Promise.all(stale.map(entry => rm(path.join(outputDirectory, entry.name))));
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
