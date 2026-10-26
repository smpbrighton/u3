export const DEFAULT_SCRIPT_PROMPT = "영상과 사진을 보고 장면별 대본을 추천해 주세요. 입력 장면과 영상 길이에 맞는 장면 수로 구성하고, 자막은 짧고 자연스러운 한국어 구어체로 작성해 주세요.";

export function buildScriptPrompt(options: {
  mode: "ai" | "direct";
  basePrompt: string;
  formatRules: string;
  userPrompt?: string;
}): string {
  const parts = [options.basePrompt];
  if (options.mode === "direct" && options.userPrompt?.trim()) {
    parts.push(`사용자 요청:\n${options.userPrompt.trim()}`);
  }
  parts.push(options.formatRules);
  return parts.join("\n\n");
}
