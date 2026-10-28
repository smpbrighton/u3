import type { CodexScript, Timeline, VideoClip } from "./schema";
import { clipDuration, videoStartTimes } from "./timeline/ops";

export function sourceAtTimelineSec(timeline: Timeline, sec: number): { clip: Extract<VideoClip, { kind: "main" }>; sourceSec: number } | null {
  const starts = videoStartTimes(timeline);
  const clip = timeline.video.find((item): item is Extract<VideoClip, { kind: "main" }> => {
    const start = starts[item.id]!;
    return item.kind === "main" && sec >= start && sec <= start + clipDuration(item);
  });
  if (!clip) return null;
  const offset = sec - starts[clip.id]!;
  const duration = clipDuration(clip);
  const safeOffset = Math.min(offset, Math.max(0, duration - 0.01));
  return { clip, sourceSec: "durationSec" in clip ? safeOffset : clip.inStartSec + safeOffset };
}

function sourceRange(clip: VideoClip): { start: number; end: number } | null {
  if (clip.kind !== "main") return null;
  if ("durationSec" in clip) return { start: 0, end: clip.durationSec };
  return { start: clip.inStartSec, end: clip.inEndSec };
}

/** 대본의 1기반 장면 번호를 영상 1의 본 화면 클립 가운데 시각으로 바꾼다. */
export function sceneFrameSec(scenes: CodexScript["scenes"], timeline: Timeline, sceneNumber: number, inputId?: string): number {
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > scenes.length) throw new RangeError("대본 장면 번호가 올바르지 않습니다");
  const scene = scenes[sceneNumber - 1]!;
  const mainIds = [...new Set(timeline.video.filter(item => item.kind === "main").map(item => item.inputId))];
  const videoOneId = inputId ?? mainIds[0];
  if (!videoOneId) throw new Error("영상 1 본 화면 클립이 없습니다");
  const starts = videoStartTimes(timeline);
  const main = timeline.video.filter((clip): clip is Extract<VideoClip, { kind: "main" }> => clip.kind === "main" && clip.inputId === videoOneId);
  const center = scene.startSec !== null && scene.endSec !== null ? (scene.startSec + scene.endSec) / 2 : null;
  const atSource = center === null ? null : main.find(clip => {
    const range = sourceRange(clip)!;
    return center >= range.start && center <= range.end;
  });
  if (atSource && center !== null) return starts[atSource.id]! + center - sourceRange(atSource)!.start;

  // 장면 시각이 짤/삭제된 구간이면 가장 가까운 본 화면 클립의 가운데 프레임을 고른다.
  const candidates = main.map(clip => ({
    sec: starts[clip.id]! + Math.max(0, Math.min(clipDuration(clip), center === null ? clipDuration(clip) / 2 : center - sourceRange(clip)!.start)),
    distance: center === null ? Infinity : Math.min(
      Math.abs(center - sourceRange(clip)!.start), Math.abs(center - sourceRange(clip)!.end),
    ),
  }));
  if (!candidates.length) throw new Error("영상 1 본 화면 클립이 없습니다");
  candidates.sort((a, b) => a.distance - b.distance || a.sec - b.sec);
  return candidates[0]!.sec;
}

/** cropY는 세로 프레임을 캐러셀 비율로 자를 때의 위쪽 위치(0~1)다. */
export function frameCropPosition(cropY: number): string {
  const y = Math.max(0, Math.min(1, Number.isFinite(cropY) ? cropY : 0.5));
  return `50% ${Number((y * 100).toFixed(4))}%`;
}

/** 대본 단계의 균등 구간 가운데 시각을 반환한다. */
export function scriptFrameSecs(count: number, durationSec: number): number[] {
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(durationSec) || durationSec < 0) throw new RangeError("프레임 수와 길이가 올바르지 않습니다");
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * durationSec);
}

export function nearestScriptFrame(secs: readonly number[], sec: number): number | null {
  return secs.reduce<number | null>((best, value) => best === null ||
    Math.abs(value - sec) < Math.abs(best - sec) ||
    (Math.abs(value - sec) === Math.abs(best - sec) && value < best) ? value : best, null);
}
