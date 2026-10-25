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

const VideoClipBase = z.union([
  z.object({ id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), durationSec: z.number().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("meme"), memeId: z.string().min(1), durationSec: z.number().positive() }),
]);
export const VideoClip = VideoClipBase.superRefine((clip, ctx) => {
  if ("inStartSec" in clip && clip.inEndSec <= clip.inStartSec) {
    ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  }
});
export type VideoClip = z.infer<typeof VideoClip>;

const OverlayBase = z.object({ id: z.string().min(1), startSec: z.number().min(0), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1) });
export const OverlayClip = z.union([
  OverlayBase.extend({ memeId: z.string().min(1), durationSec: z.number().positive() }),
  OverlayBase.extend({ inputId: z.string().min(1), kind: z.literal("video"), inStartSec: z.number().min(0), inEndSec: z.number().positive() }).superRefine((clip, ctx) => {
    if (clip.inEndSec <= clip.inStartSec) ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  }),
  OverlayBase.extend({ inputId: z.string().min(1), kind: z.literal("photo"), durationSec: z.number().positive() }),
]);
export type OverlayClip = z.infer<typeof OverlayClip>;

export const TextClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), endSec: z.number().positive(), text: z.string() })
  .superRefine((clip, ctx) => {
    if (clip.endSec <= clip.startSec) ctx.addIssue({ code: "custom", path: ["endSec"], message: "endSec는 startSec보다 커야 합니다" });
  });
export type TextClip = z.infer<typeof TextClip>;
export const AudioClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), file: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive(), gain: z.number().min(0).max(1.5) })
  .superRefine((clip, ctx) => {
    if (clip.inEndSec <= clip.inStartSec) ctx.addIssue({ code: "custom", path: ["inEndSec"], message: "inEndSec는 inStartSec보다 커야 합니다" });
  });
export type AudioClip = z.infer<typeof AudioClip>;

export const Timeline = z.object({
  video: z.array(VideoClip),
  overlays: z.array(z.array(OverlayClip)).default([]),
  captions: z.array(TextClip),
  voice: z.array(AudioClip),
  sfx: z.array(AudioClip),
  audio: z.object({
    source: Gain,
    voice: Gain,
    sfx: Gain,
    stems: z.record(z.string(), z.object({ voice: Gain, bg: Gain })).optional(),
  }),
});
export type Timeline = z.infer<typeof Timeline>;

export const Project = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(Input).min(1).max(20),
  timeline: Timeline,
  savedAt: z.string().datetime(),
});
export type Project = z.infer<typeof Project>;

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
  memeBefore: z.boolean().describe("reaction이 있으면 짤을 본 화면 앞에 둘 때 true. 앞·뒤 중 한 곳만 true로 선택."),
  memeAfter: z.boolean().describe("reaction이 있으면 짤을 본 화면 뒤에 둘 때 true. 앞·뒤 중 한 곳만 true로 선택. reaction이 null이면 false."),
  sfxCategory: SceneSfx.nullable(),
};
export const ScriptScene = z.union([
  z.object({ ...ScriptSceneCommon, startSec: z.number().min(0), endSec: z.number().positive() }),
  z.object({ ...ScriptSceneCommon, startSec: z.null(), endSec: z.null() }),
]);
export const CodexScript = z.object({ scenes: z.array(ScriptScene).min(1) });
export type CodexScript = z.infer<typeof CodexScript>;
