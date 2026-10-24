import { z } from "zod";

export const Input = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "photo"]),
  file: z.string().min(1),
  durationSec: z.number().positive().optional(),
});
export type Input = z.infer<typeof Input>;

export const Gain = z.object({ gain: z.number().min(0).max(1.5), muted: z.boolean() });
export type Gain = z.infer<typeof Gain>;

export const VideoClip = z.union([
  z.object({ id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("main"), inputId: z.string().min(1), durationSec: z.number().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("meme"), memeId: z.string().min(1), durationSec: z.number().positive() }),
]);
export type VideoClip = z.infer<typeof VideoClip>;

export const TextClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), endSec: z.number().positive(), text: z.string() });
export type TextClip = z.infer<typeof TextClip>;
export const AudioClip = z.object({ id: z.string().min(1), startSec: z.number().min(0), file: z.string().min(1), inStartSec: z.number().min(0), inEndSec: z.number().positive(), gain: z.number().min(0).max(1.5) });
export type AudioClip = z.infer<typeof AudioClip>;

export const Timeline = z.object({
  video: z.array(VideoClip),
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

export const ScriptScene = z.object({
  caption: z.string().min(1), inputIndex: z.number().int().min(1).max(20),
  startSec: z.number().min(0), endSec: z.number().positive(), reaction: z.string().optional(),
  memeBefore: z.boolean().default(false), memeAfter: z.boolean().default(false), sfxCategory: SceneSfx.optional(),
});
export const CodexScript = z.object({ scenes: z.array(ScriptScene).min(1) });
export type CodexScript = z.infer<typeof CodexScript>;
