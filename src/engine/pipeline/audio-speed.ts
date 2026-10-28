import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Speed, type AudioCache, type AudioCacheEntry, type Project } from "../../core/schema";
import { cacheKey, clipSpeed } from "../../core/timeline/speed";

export async function audioVersion(file: string): Promise<string> {
  const info = await stat(file);
  return createHash("sha256").update(`${info.size}:${info.mtimeMs}`).digest("hex").slice(0, 16);
}

export function projectAudioPath(projectDir: string, file: string): string {
  if (path.isAbsolute(file) || path.win32.isAbsolute(file) || file.includes("\0") || file.split(/[\\/]/).includes("..")) throw new Error("프로젝트 밖의 오디오는 처리할 수 없습니다");
  const root = path.resolve(projectDir), absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) throw new Error("프로젝트 밖의 오디오는 처리할 수 없습니다");
  return absolute;
}

export async function prepareSpeedAudio(options: { projectDir: string; sourceAbs: string; sourceId: string; speed: number; signal?: AbortSignal }): Promise<AudioCacheEntry & { key: string }> {
  const { projectDir, sourceAbs, sourceId, speed, signal } = options;
  Speed.parse(speed);
  const cancelled = () => signal?.throwIfAborted();
  cancelled();
  const { ffprobe, runFfmpeg } = await import("./ffmpeg");
  const version = await audioVersion(sourceAbs), key = cacheKey(sourceId, speed);
  const relative = (absolute: string) => path.relative(projectDir, absolute).split(path.sep).join("/");
  if (speed === 1) {
    const probe = await ffprobe(sourceAbs);
    return { key, file: relative(sourceAbs), durationSec: Number(probe.format.duration), version };
  }
  const sourceKey = createHash("sha256").update(sourceId).digest("hex").slice(0, 16);
  // 처리 버전과 형식을 파일 이름에 넣는다. 같은 이름의 새 원본도 이전 캐시와 섞이지 않는다.
  const file = `cache/audio/${sourceKey}-${speed}-${version}-v1-pcm16.wav`;
  const destination = path.join(projectDir, file);
  const validDuration = (probe: Awaited<ReturnType<typeof ffprobe>>) => {
    const duration = Number(probe.format.duration);
    if (!probe.streams.some(s => s.codec_type === "audio") || !Number.isFinite(duration) || duration <= 0) throw new Error("배속 음성의 길이를 확인하지 못했습니다");
    return duration;
  };
  const sourceDuration = validDuration(await ffprobe(sourceAbs));
  const checkedDuration = async (target: string) => {
    const duration = validDuration(await ffprobe(target));
    if (Math.abs(duration - sourceDuration / speed) > 1 / 30) throw new Error("배속 음성의 길이 오차가 1프레임을 넘습니다");
    return duration;
  };
  const cached = await checkedDuration(destination).catch(() => null);
  cancelled();
  if (cached !== null) return { key, file, durationSec: cached, version };
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(projectDir, `cache/audio/.tmp-${randomUUID()}.wav`);
  try {
    await runFfmpeg(["-i", sourceAbs, "-vn", "-filter:a", `atempo=${speed}`, "-c:a", "pcm_s16le", temporary], signal);
    const durationSec = await checkedDuration(temporary);
    cancelled();
    if (await audioVersion(sourceAbs) !== version) throw new Error("처리 중 원본 음성이 바뀌었습니다");
    await rename(temporary, destination);
    return { key, file, durationSec, version };
  } finally { await rm(temporary, { force: true }); }
}

export async function prepareProjectAudio(projectDir: string, project: Project, signal?: AbortSignal): Promise<AudioCache> {
  const cache = { ...project.audioCache };
  const clips = [...project.timeline.video, ...project.timeline.overlays.flat(), ...project.timeline.voice];
  const requested = new Set<string>();
  for (const clip of clips) {
    if (!("inStartSec" in clip) || clipSpeed(clip) === 1) continue;
    const sourceId = "file" in clip ? clip.file : "inputId" in clip ? clip.inputId : "";
    const key = cacheKey(sourceId, clipSpeed(clip));
    if (requested.has(key)) continue;
    requested.add(key);
    const input = project.inputs.find(i => i.id === sourceId);
    const file = input?.file ?? sourceId;
    const sourceAbs = projectAudioPath(projectDir, file);
    if (input) {
      const { ffprobe } = await import("./ffmpeg");
      if (!(await ffprobe(sourceAbs)).streams.some(s => s.codec_type === "audio")) { delete cache[key]; continue; }
    }
    cache[key] = await prepareSpeedAudio({ projectDir, sourceAbs, sourceId, speed: clipSpeed(clip), signal });
  }
  return cache;
}

export async function pruneAudioCache(projectDir: string, project: Project): Promise<void> {
  const references = new Set([...project.inputs.map(i => i.file), ...[...project.timeline.voice, ...project.timeline.sfx].map(c => c.file), ...Object.values(project.audioCache ?? {}).map(c => c.file)]);
  for (const directory of ["cache/audio", "voice"]) {
    for (const file of await readdir(path.join(projectDir, directory)).catch(() => [])) {
      const relative = `${directory}/${file}`;
      if ((directory === "cache/audio" || /^tts-.*\.wav$/.test(file)) && !references.has(relative)) await rm(path.join(projectDir, relative), { force: true });
    }
  }
}
