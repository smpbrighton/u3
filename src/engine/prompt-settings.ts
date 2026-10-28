import type { PromptDefaults } from "../core/default-prompts";
import { promptHash } from "./prompt-defaults";

export const PROMPT_SETTINGS = [
  { kind: "script", key: "scriptPrompt", baseKey: "scriptPromptBaseHash", field: "script" },
  { kind: "topic", key: "carouselTopicPrompt", baseKey: "carouselTopicPromptBaseHash", field: "carouselTopic" },
  { kind: "video", key: "carouselVideoPrompt", baseKey: "carouselVideoPromptBaseHash", field: "carouselVideo" },
] as const;
type PromptKind = typeof PROMPT_SETTINGS[number]["kind"];

export function promptState(settings: Record<string, unknown>, defaults: PromptDefaults, kind: PromptKind) {
  const { key, baseKey, field } = PROMPT_SETTINGS.find(setting => setting.kind === kind)!;
  const defaultPrompt = defaults[field];
  const saved = settings[key];
  const customized = typeof saved === "string" && !!saved.trim();
  const prompt = customized ? saved : defaultPrompt;
  return {
    prompt,
    isDefault: prompt === defaultPrompt,
    defaultPrompt,
    newerDefault: customized && typeof settings[baseKey] === "string" && settings[baseKey] !== promptHash(defaultPrompt),
  };
}

export function applyPrompt(settings: Record<string, unknown>, defaults: PromptDefaults, kind: PromptKind, raw: string): void {
  const { key, baseKey, field } = PROMPT_SETTINGS.find(setting => setting.kind === kind)!;
  const prompt = raw.trim();
  if (!prompt || prompt === defaults[field]) {
    delete settings[key];
    delete settings[baseKey];
  } else {
    settings[key] = prompt;
    settings[baseKey] = promptHash(defaults[field]);
  }
}
