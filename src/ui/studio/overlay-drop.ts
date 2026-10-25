export interface OverlayDropInput {
  source: { kind: "meme" | "video" | "photo"; id: string };
  targetTrack: "overlay" | "video" | "other";
  hitsVideoClip: boolean;
  atSec: number;
  videoDurationSec: number;
}

export type OverlayDropDecision = { kind: "overlay" | "append-video"; startSec: number } | { kind: "reject" };

export function decideOverlayDrop(input: OverlayDropInput): OverlayDropDecision {
  if (!Number.isFinite(input.atSec) || input.atSec < 0 || !Number.isFinite(input.videoDurationSec) || input.videoDurationSec < 0) return { kind: "reject" };
  if (input.targetTrack === "overlay" || (input.targetTrack === "video" && input.hitsVideoClip)) {
    if (input.atSec < input.videoDurationSec) return { kind: "overlay", startSec: input.atSec };
    return input.atSec === input.videoDurationSec ? { kind: "append-video", startSec: input.videoDurationSec } : { kind: "reject" };
  }
  if (input.source.kind !== "meme" && input.atSec >= input.videoDurationSec) return { kind: "append-video", startSec: input.videoDurationSec };
  if (input.source.kind === "meme" && input.atSec >= input.videoDurationSec) return { kind: "append-video", startSec: input.videoDurationSec };
  return { kind: "reject" };
}
