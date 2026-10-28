import { z } from "zod";
import { DEFAULT_SCRIPT_PROMPT } from "./script-prompt";
import { DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "./carousel-prompt";

export const PROMPT_SCHEMA = 1;
export const PROMPT_REVISION = 1;
export const PROMPT_TEXT_HASH = "b45d1e8e4fd0aeb46c5fdec93b65f6cdac99296e1b37c10e78c6bbf468c5c367";

const PromptText = z.string().trim().min(1).max(20_000);
export const PromptDefaultsFile = z.object({
  schema: z.literal(PROMPT_SCHEMA),
  revision: z.number().int().min(1),
  script: PromptText,
  carouselTopic: PromptText,
  carouselVideo: PromptText,
});
export type PromptDefaults = z.infer<typeof PromptDefaultsFile>;

export const BUNDLED_PROMPT_DEFAULTS: PromptDefaults = {
  schema: PROMPT_SCHEMA,
  revision: PROMPT_REVISION,
  script: DEFAULT_SCRIPT_PROMPT,
  carouselTopic: DEFAULT_CAROUSEL_TOPIC_PROMPT,
  carouselVideo: DEFAULT_CAROUSEL_VIDEO_PROMPT,
};
