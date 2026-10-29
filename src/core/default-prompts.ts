import { z } from "zod";
import { DEFAULT_SCRIPT_PROMPT, DEFAULT_SCRIPT_TONE, DEFAULT_SCRIPT_PERSONA } from "./script-prompt";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "./carousel-prompt";

export const PROMPT_SCHEMA = 1;
export const PROMPT_REVISION = 2;
export const PROMPT_TEXT_HASH = "9fd6f5724e4990178c03574e4b7a4ade5b1d528bd3d1c0ca3fc92f972b9c219d";

const PromptText = z.string().trim().min(1).max(20_000);
export const PromptDefaultsFile = z.object({
  schema: z.literal(PROMPT_SCHEMA),
  revision: z.number().int().min(1),
  script: PromptText,
  tone: z.string().trim().min(1).max(4000),
  persona: z.string().trim().min(1).max(4000),
  carouselTopic: PromptText,
  carouselVideo: PromptText,
});
export type PromptDefaults = z.infer<typeof PromptDefaultsFile>;

export const BUNDLED_PROMPT_DEFAULTS: PromptDefaults = {
  schema: PROMPT_SCHEMA,
  revision: PROMPT_REVISION,
  script: DEFAULT_SCRIPT_PROMPT,
  tone: DEFAULT_SCRIPT_TONE,
  persona: DEFAULT_SCRIPT_PERSONA,
  carouselTopic: DEFAULT_CAROUSEL_TOPIC_PROMPT,
  carouselVideo: DEFAULT_CAROUSEL_VIDEO_PROMPT,
};
