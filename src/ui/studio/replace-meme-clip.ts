import type { Timeline, VideoClip } from "../../core/schema";

export function replaceMemeClip(timeline: Timeline, clipId: string, memeId: string): Timeline {
  let replaced = false;
  const video = timeline.video.map((clip): VideoClip => {
    if (clip.id !== clipId || clip.kind !== "meme") return clip;
    replaced = true;
    return { ...clip, memeId };
  });

  return replaced ? { ...timeline, video } : timeline;
}
