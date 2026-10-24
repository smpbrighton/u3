import type { AudioClip, TextClip, Timeline, VideoClip } from "../schema";

export function clipDuration(clip: VideoClip): number {
  return "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
}

export function videoStartTimes(timeline: Timeline): Record<string, number> {
  let at = 0;
  const starts: Record<string, number> = {};
  for (const clip of timeline.video) {
    starts[clip.id] = at;
    at += clipDuration(clip);
  }
  return starts;
}

export function videoDuration(timeline: Timeline): number {
  return timeline.video.reduce((sum, clip) => sum + clipDuration(clip), 0);
}

function requireClip<T extends { id: string }>(clips: readonly T[], id: string, track: string): T {
  const clip = clips.find((item) => item.id === id);
  if (!clip) throw new Error(`${track} 클립을 찾을 수 없습니다: ${id}`);
  return clip;
}

export function splitVideoClip(timeline: Timeline, clipId: string, atSec: number, ids: readonly [string, string] = [`${clipId}-a`, `${clipId}-b`]): Timeline {
  const clip = requireClip(timeline.video, clipId, "video");
  const start = videoStartTimes(timeline)[clipId]!;
  const offset = atSec - start;
  const duration = clipDuration(clip);
  if (!(offset > 0 && offset < duration)) throw new RangeError("자르기 위치는 클립 안쪽이어야 합니다");
  const pieces: [VideoClip, VideoClip] = "durationSec" in clip
    ? [{ ...clip, id: ids[0], durationSec: offset }, { ...clip, id: ids[1], durationSec: duration - offset }]
    : [
        { ...clip, id: ids[0], inEndSec: clip.inStartSec + offset },
        { ...clip, id: ids[1], inStartSec: clip.inStartSec + offset },
      ];
  const video = timeline.video.flatMap((item) => item.id === clipId ? pieces : [item]);
  return { ...timeline, video };
}

export function trimVideoClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number, inputDurationSec?: number): Timeline {
  const clip = requireClip(timeline.video, clipId, "video");
  const start = videoStartTimes(timeline)[clipId]!;
  const duration = clipDuration(clip);
  if (edge === "start" ? toSec <= start : toSec >= start + duration) throw new RangeError("클립을 늘리는 트림은 지원하지 않습니다");
  const remaining = edge === "start" ? start + duration - toSec : toSec - start;
  if (!(remaining > 0)) throw new RangeError("트림 결과 길이는 0보다 커야 합니다");
  if ("durationSec" in clip) {
    const video = timeline.video.map((item) => item.id === clipId ? { ...clip, durationSec: remaining } : item);
    return { ...timeline, video };
  }
  if (inputDurationSec === undefined || !Number.isFinite(inputDurationSec) || inputDurationSec <= 0) throw new RangeError("영상 원본 길이가 필요합니다");
  const nextStart = edge === "start" ? clip.inStartSec + (toSec - start) : clip.inStartSec;
  const nextEnd = edge === "end" ? clip.inStartSec + remaining : clip.inEndSec;
  if (inputDurationSec !== undefined && nextEnd > inputDurationSec) throw new RangeError("영상 구간이 원본 길이를 넘습니다");
  if (nextStart < 0 || nextEnd <= nextStart) throw new RangeError("원본 구간이 올바르지 않습니다");
  return { ...timeline, video: timeline.video.map((item) => item.id === clipId ? { ...clip, inStartSec: nextStart, inEndSec: nextEnd } : item) };
}

export function moveVideoClip(timeline: Timeline, clipId: string, toIndex: number): Timeline {
  requireClip(timeline.video, clipId, "video");
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= timeline.video.length) throw new RangeError("이동 위치가 올바르지 않습니다");
  const video = [...timeline.video];
  const [clip] = video.splice(video.findIndex((item) => item.id === clipId), 1);
  video.splice(toIndex, 0, clip!);
  return { ...timeline, video };
}

export function deleteVideoClip(timeline: Timeline, clipId: string): Timeline {
  requireClip(timeline.video, clipId, "video");
  return { ...timeline, video: timeline.video.filter((clip) => clip.id !== clipId) };
}

export function trimCaptionClip(timeline: Timeline, clipId: string, edge: "start" | "end", toSec: number): Timeline {
  const clip = requireClip(timeline.captions, clipId, "caption");
  if (edge === "start" ? toSec <= clip.startSec : toSec >= clip.endSec) throw new RangeError("클립을 늘리는 트림은 지원하지 않습니다");
  const next = edge === "start" ? { ...clip, startSec: toSec } : { ...clip, endSec: toSec };
  if (next.startSec < 0 || next.endSec <= next.startSec) throw new RangeError("자막 구간이 올바르지 않습니다");
  return { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

export function moveCaptionClip(timeline: Timeline, clipId: string, startSec: number): Timeline {
  const clip = requireClip(timeline.captions, clipId, "caption");
  if (startSec < 0) throw new RangeError("시작 시각은 0 이상이어야 합니다");
  const next = { ...clip, startSec, endSec: startSec + clip.endSec - clip.startSec };
  return { ...timeline, captions: timeline.captions.map((item) => item.id === clipId ? next : item) };
}

export function trimAudioClip(clips: readonly AudioClip[], clipId: string, edge: "start" | "end", toSec: number): AudioClip[] {
  const clip = requireClip(clips, clipId, "audio");
  const timelineEnd = clip.startSec + clip.inEndSec - clip.inStartSec;
  if (edge === "start" ? toSec <= clip.startSec : toSec >= timelineEnd) throw new RangeError("클립을 늘리는 트림은 지원하지 않습니다");
  const duration = clip.inEndSec - clip.inStartSec;
  const offset = toSec - clip.startSec;
  let next: AudioClip;
  if (edge === "start") {
    const delta = offset;
    next = { ...clip, startSec: toSec, inStartSec: clip.inStartSec + delta };
  } else {
    next = { ...clip, inEndSec: clip.inStartSec + offset };
  }
  if (next.startSec < 0 || next.inEndSec <= next.inStartSec || next.inEndSec > clip.inStartSec + duration) throw new RangeError("오디오 구간이 올바르지 않습니다");
  return clips.map((item) => item.id === clipId ? next : item);
}

export function moveAudioClip(clips: readonly AudioClip[], clipId: string, startSec: number): AudioClip[] {
  const clip = requireClip(clips, clipId, "audio");
  if (startSec < 0) throw new RangeError("시작 시각은 0 이상이어야 합니다");
  return clips.map((item) => item.id === clipId ? { ...clip, startSec } : item);
}

export function deleteCaptionClip(clips: readonly TextClip[], clipId: string): TextClip[] {
  requireClip(clips, clipId, "caption");
  return clips.filter((clip) => clip.id !== clipId);
}

export function deleteAudioClip(clips: readonly AudioClip[], clipId: string): AudioClip[] {
  requireClip(clips, clipId, "audio");
  return clips.filter((clip) => clip.id !== clipId);
}
