// 공식 최소 버전 문서는 없다. openai/codex #49396의 0.157.1 실패·0.159.3 성공 보고를 기준으로 둔다.
export const CODEX_MIN_VERSION = "0.159.3";
export const CODEX_MODEL_PREFERENCE = ["gpt-6.1-sol", "gpt-6-luna", "gpt-6.1-terra", "gpt-6-astra"] as const;
export const CODEX_FALLBACK_MODELS = [{ slug: CODEX_MODEL_PREFERENCE[0], displayName: "GPT-6.1-Sol", efforts: ["low", "medium", "high"] }];

function orderedModels(catalogSlugs: readonly string[]): string[] {
  return [...new Set([...CODEX_MODEL_PREFERENCE.filter(model => catalogSlugs.includes(model)), ...catalogSlugs])];
}

export function resolveCodexModel(saved: unknown, catalogSlugs: readonly string[]): string {
  if (typeof saved === "string" && saved && (!catalogSlugs.length || catalogSlugs.includes(saved))) return saved;
  return orderedModels(catalogSlugs)[0] ?? CODEX_MODEL_PREFERENCE[0];
}

export function nextCodexModel(failed: readonly string[], catalogSlugs: readonly string[]): string | null {
  return orderedModels(catalogSlugs).find(model => !failed.includes(model)) ?? null;
}

export function isCodexModelUnavailable(text: string): boolean {
  return /not supported when using Codex with a ChatGPT account|"code"\s*:\s*"model_not_found"|Model metadata for '.+' not found/i.test(text);
}

export function compareVersion(a: string, b: string): number {
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function isCodexOutdated(version: string | null | undefined): boolean {
  return !!version && compareVersion(version, CODEX_MIN_VERSION) < 0;
}
