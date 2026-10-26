import { z } from "zod";

export const Input = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "photo"]),
  file: z.string().min(1),
  displayName: z.string().min(1).optional(),
  durationSec: z.number().positive().optional(),
});
export type Input = z.infer<typeof Input>;

export const Gain = z.object({ gain: z.number().min(0).max(1.5), muted: z.boolean() });
export type Gain = z.infer<typeof Gain>;
export const TimelineAudio = z.object({ source: Gain, voice: Gain, sfx: Gain, stems: z.record(z.string(), z.object({ voice: Gain, bg: Gain })).optional() });

export const TransitionKind = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("dissolve") }),
  z.object({ kind: z.literal("black-fade") }),
  z.object({ kind: z.literal("slide"), direction: z.enum(["left", "right", "up", "down"]) }),
  z.object({ kind: z.literal("wipe"), direction: z.enum(["left", "right", "up", "down"]) }),
  z.object({ kind: z.literal("iris") }),
  z.object({ kind: z.literal("zoom") }),
]);
export type TransitionKind = z.infer<typeof TransitionKind>;

const ClipTransitionValue = z.object({
  kind: TransitionKind,
  durationSec: z.number().min(0.1).max(2).default(0.5),
});
export const ClipTransition = ClipTransitionValue.default({ kind: { kind: "none" }, durationSec: 0.5 });
export type ClipTransition = z.output<typeof ClipTransition>;
export type ClipTransitionInput = z.input<typeof ClipTransition>;
const DefaultClipTransition = ClipTransition.optional().default({ kind: { kind: "none" }, durationSec: 0.5 });

const VideoClipProperties = {
  groupId: z.string().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  startTransition: DefaultClipTransition,
  endTransition: DefaultClipTransition,
};

const VideoClipBase = z.union([
  z.object({ ...VideoClipProperties, id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive() }),
  z.object({ ...VideoClipProperties, id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), durationSec: z.number().positive() }),
  z.object({ ...VideoClipProperties, id: z.string().min(1), kind: z.literal("meme"), memeId: z.string().min(1), durationSec: z.number().positive() }),
]);
export const VideoClip = VideoClipBase.superRefine((clip, ctx) => {
  const durationSec = "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
  if ("inStartSec" in clip && clip.inEndSec <= clip.inStartSec) {
    ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  }
  for (const edge of ["startTransition", "endTransition"] as const) {
    const transition = clip[edge];
    if (transition && transition.kind.kind !== "none" && transition.durationSec > durationSec / 2) {
      ctx.addIssue({ code: "custom", path: [edge, "durationSec"], message: "전환 길이는 클립 길이의 절반을 넘을 수 없습니다" });
    }
  }
});
type VideoClipMetadata = {
  groupId?: string;
  startTransition?: ClipTransitionInput;
  endTransition?: ClipTransitionInput;
};
export type VideoClip = VideoClipMetadata & { opacity?: number } & (
  | { id: string; kind: "main"; inputId: string; inStartSec: number; inEndSec: number }
  | { id: string; kind: "main"; inputId: string; durationSec: number }
  | { id: string; kind: "meme"; memeId: string; durationSec: number }
);

const OverlayProperties = {
  groupId: z.string().min(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  startTransition: ClipTransitionValue.optional(),
  endTransition: ClipTransitionValue.optional(),
};
const OverlayBase = z.object({ ...OverlayProperties, id: z.string().min(1), startSec: z.number().min(0), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1) });
export const OverlayClip = z.union([
  OverlayBase.extend({ memeId: z.string().min(1), durationSec: z.number().positive() }),
  OverlayBase.extend({ inputId: z.string().min(1), kind: z.literal("video"), inStartSec: z.number().min(0), inEndSec: z.number().positive() }).superRefine((clip, ctx) => {
    if (clip.inEndSec <= clip.inStartSec) ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  }),
  OverlayBase.extend({ inputId: z.string().min(1), kind: z.literal("photo"), durationSec: z.number().positive() }),
]).superRefine((clip, ctx) => {
  const durationSec = "durationSec" in clip ? clip.durationSec : clip.inEndSec - clip.inStartSec;
  for (const edge of ["startTransition", "endTransition"] as const) {
    const transition = clip[edge];
    if (transition && transition.kind.kind !== "none" && transition.durationSec > durationSec / 2) {
      ctx.addIssue({ code: "custom", path: [edge, "durationSec"], message: "전환 길이는 클립 길이의 절반을 넘을 수 없습니다" });
    }
  }
});
export type OverlayClip = VideoClipMetadata & { opacity?: number } & (
  | { id: string; startSec: number; x: number; y: number; width: number; memeId: string; durationSec: number }
  | { id: string; startSec: number; x: number; y: number; width: number; inputId: string; kind: "video"; inStartSec: number; inEndSec: number }
  | { id: string; startSec: number; x: number; y: number; width: number; inputId: string; kind: "photo"; durationSec: number }
);

export const TextClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), endSec: z.number().positive(), text: z.string(), opacity: z.number().min(0).max(1).optional() })
  .superRefine((clip, ctx) => {
    if (clip.endSec <= clip.startSec) ctx.addIssue({ code: "custom", path: ["endSec"], message: "endSec는 startSec보다 커야 합니다" });
  });
export type TextClip = z.infer<typeof TextClip>;
export const AudioClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), file: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive(), gain: z.number().min(0).max(1.5), lane: z.number().int().min(0).optional(), fadeOutSec: z.number().min(0).optional() })
  .superRefine((clip, ctx) => {
    if (clip.inEndSec <= clip.inStartSec) ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  });
export type AudioClip = z.infer<typeof AudioClip>;

export const CaptionStyle = z.object({
  font: z.enum(["pretendard", "gmarket", "tmon"]), mainSize: z.number().positive().default(56), subSize: z.number().positive().default(40),
  color: z.string().default("#FFFFFF"), textOpacity: z.number().min(0).max(1).default(1), bar: z.boolean().default(true),
  barColor: z.string().default("#000000"), barOpacity: z.number().min(0).max(1).default(0.62),
});
export type CaptionStyle = z.output<typeof CaptionStyle>;
export const CaptionLayer = z.object({ id: z.string().min(1), name: z.string().min(1), x: z.number().min(0).max(1), y: z.number().min(0).max(1), opacity: z.number().min(0).max(1).optional(), style: CaptionStyle, main: z.array(TextClip), sub: z.array(TextClip) });
export type CaptionLayer = z.infer<typeof CaptionLayer>;
export const TimelineBrand = z.object({
  watermark: z.object({ enabled: z.boolean().optional(), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), width: z.number().positive().max(1).optional(), opacity: z.number().min(0).max(1).optional() }).optional(),
  titleBar: z.object({ enabled: z.boolean().optional(), text: z.string(), height: z.number().positive().optional(), fontSize: z.number().positive().optional(), opacity: z.number().min(0).max(1).optional() }).optional(),
});
export type TimelineBrand = z.infer<typeof TimelineBrand>;
export const Timeline = z.object({
  video: z.array(VideoClip),
  overlays: z.array(z.array(OverlayClip)).default([]),
  captions: z.array(TextClip).optional(),
  captionLayers: z.array(CaptionLayer).optional(),
  captionX: z.number().min(0).max(1).optional(),
  captionY: z.number().optional(),
  brand: TimelineBrand.optional(),
  voice: z.array(AudioClip),
  sfx: z.array(AudioClip),
  audio: z.object({
    source: Gain,
    voice: Gain,
    sfx: Gain,
    stems: z.record(z.string(), z.object({ voice: Gain, bg: Gain })).optional(),
  }),
}).transform(({ captions, captionLayers, captionX, captionY, ...timeline }) => {
  const layers = captionLayers ?? [{ id: "caption-layer-1", name: "자막", x: captionX ?? 0.5, y: captionY === undefined ? 1555 / 1920 : Math.max(0, Math.min(1, (captionY + 105) / 1920)), style: { font: "pretendard" as const, mainSize: 56, subSize: 40, color: "#FFFFFF", textOpacity: 1, bar: true, barColor: "#000000", barOpacity: 0.62 }, main: captions ?? [], sub: [] }];
  const normalized = { ...timeline, captionLayers: layers, captions: layers[0]?.main ?? [] };
  Object.defineProperty(normalized, "toJSON", { enumerable: false, value() { const { captions: _legacyCaptions, ...canonical } = this as typeof normalized; return canonical; } });
  return normalized;
});
export type Timeline = {
  voice: AudioClip[];
  sfx: AudioClip[];
  audio: z.infer<typeof TimelineAudio>;
  video: VideoClip[];
  overlays: OverlayClip[][];
  captions: TextClip[];
  captionLayers?: CaptionLayer[];
  brand?: TimelineBrand;
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = { font: "pretendard", mainSize: 56, subSize: 40, color: "#FFFFFF", textOpacity: 1, bar: true, barColor: "#000000", barOpacity: 0.62 };
export function captionLayersOf(timeline: Timeline): CaptionLayer[] {
  return timeline.captionLayers ?? [{ id: "caption-layer-1", name: "자막", x: 0.5, y: 1555 / 1920, style: DEFAULT_CAPTION_STYLE, main: timeline.captions, sub: [] }];
}
export function withCaptionLayers(timeline: Timeline, captionLayers: CaptionLayer[]): Timeline {
  return { ...timeline, captionLayers, captions: captionLayers[0]?.main ?? [] };
}

export type CanonicalTimeline = Timeline & { captionLayers: CaptionLayer[] };
export class ProjectRecord {
  id: string;
  name: string;
  inputs: Input[];
  savedAt: string;
  private timelineValue: CanonicalTimeline;

  constructor(value: { id: string; name: string; inputs: Input[]; timeline: CanonicalTimeline; savedAt: string }) {
    this.id = value.id;
    this.name = value.name;
    this.inputs = value.inputs;
    this.savedAt = value.savedAt;
    this.timelineValue = value.timeline;
    Object.defineProperty(this, "timeline", { enumerable: true, configurable: false, get: () => this.timelineValue, set: (timeline: Timeline) => { this.timelineValue = Timeline.parse(timeline) as CanonicalTimeline; } });
  }

  get timeline(): CanonicalTimeline { return this.timelineValue; }
  set timeline(value: Timeline) { this.timelineValue = Timeline.parse(value) as CanonicalTimeline; }
  toJSON() { return { id: this.id, name: this.name, inputs: this.inputs, timeline: this.timelineValue, savedAt: this.savedAt }; }
}

export const Project = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(Input).min(1).max(20),
  timeline: Timeline,
  savedAt: z.string().datetime(),
}).transform((project) => new ProjectRecord(project as { id: string; name: string; inputs: Input[]; timeline: CanonicalTimeline; savedAt: string }));
export type Project = { id: string; name: string; inputs: Input[]; timeline: Timeline; savedAt: string };

export const WordStamp = z.object({ text: z.string(), start: z.number().min(0), end: z.number().min(0) });
export type WordStamp = z.infer<typeof WordStamp>;

export const SCENE_SFX = ["shock", "fail", "laugh", "applause", "alarm", "impact", "bruh", "notify", "pop", "reveal"] as const;
export const SceneSfx = z.enum(SCENE_SFX);
export type SceneSfx = z.infer<typeof SceneSfx>;

export const MemeMeta = z.object({
  id: z.string().min(1), emotion: z.string().min(1), situations: z.array(z.string()),
  importedAt: z.string(), tagsConfirmed: z.boolean(), description: z.string().optional(),
  durationSec: z.number().positive().optional(), file: z.string().optional(),
});
export type MemeMeta = z.infer<typeof MemeMeta>;

export const SfxMeta = z.object({
  id: z.string().min(1), category: z.string().min(1), file: z.string().min(1), title: z.string().min(1),
  source: z.string().min(1), license: z.string().min(1), durationSec: z.number().positive(),
});
export type SfxMeta = z.infer<typeof SfxMeta>;

const ScriptSceneCommon = {
  caption: z.string().min(1), inputIndex: z.number().int().min(1).max(20), reaction: z.string().nullable(),
  memeBefore: z.boolean().default(false).describe("reaction이 있으면 짤을 본 화면 앞에 둘 때 true. 앞·뒤 중 한 곳만 true로 선택."),
  memeAfter: z.boolean().default(false).describe("reaction이 있으면 짤을 본 화면 뒤에 둘 때 true. 앞·뒤 중 한 곳만 true로 선택. reaction이 null이면 false."),
  sfxCategory: SceneSfx.nullable(),
};
export const ScriptScene = z.union([
  z.object({ ...ScriptSceneCommon, subCaption: z.string().optional(), startSec: z.number().min(0), endSec: z.number().positive() }),
  z.object({ ...ScriptSceneCommon, subCaption: z.string().optional(), startSec: z.null(), endSec: z.null() }),
]);
export const CodexScript = z.object({ title: z.string().max(30).optional(), scenes: z.array(ScriptScene).min(1) });
export type CodexScript = z.infer<typeof CodexScript>;
