import { codexCommand } from "./pipeline/codex-path";
import { SPAWN_OPTIONS } from "./spawn-options";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CODEX_FALLBACK_MODELS, nextCodexModel, resolveCodexModel } from "../core/codex-model";
import type { AppContext } from "./app";
import { HttpError } from "./http";
import { CodexError, CodexModelUnavailableError } from "./pipeline/codex";

const execFileAsync = promisify(execFile);
type CodexModel = { slug: string; displayName: string; efforts: string[] };
type CodexModels = { source: "codex-cli" | "fallback"; models: CodexModel[] };
type CodexCatalog = { models?: Array<{ slug?: unknown; display_name?: unknown; visibility?: unknown; supported_reasoning_levels?: Array<{ effort?: unknown }> }> };
const catalogCache = new Map<string, { expires: number; value: Promise<CodexModels> }>();

// 최신 목록을 먼저 읽고, 실패하면 실행 파일에 든 목록을 쓴다. 다른 제공자 경로는 뺀다(결정 0018).
async function loadCodexModels(bin: string): Promise<CodexModels> {
  for (const args of [[], ["--bundled"]]) {
    try {
      const command = await codexCommand(bin, ["debug", "models", ...args]);
      const { stdout } = await execFileAsync(command.bin, command.args, { ...SPAWN_OPTIONS, timeout: 8_000, maxBuffer: 32 * 1024 * 1024 });
      const catalog = JSON.parse(stdout) as CodexCatalog;
      const models = catalog.models?.flatMap(model => {
        if (typeof model.slug !== "string" || model.visibility !== "list" || model.slug.includes("/")) return [];
        const efforts = model.supported_reasoning_levels?.flatMap(item => typeof item.effort === "string" ? [item.effort] : []) ?? [];
        return [{ slug: model.slug, displayName: typeof model.display_name === "string" ? model.display_name : model.slug, efforts }];
      }) ?? [];
      if (models.length) return { source: "codex-cli", models };
    } catch { /* 다음 목록으로 넘어간다. */ }
  }
  return { source: "fallback", models: CODEX_FALLBACK_MODELS };
}

export function readCodexModels(bin: string | null): Promise<CodexModels> {
  if (!bin) return Promise.resolve({ source: "fallback", models: CODEX_FALLBACK_MODELS });
  const now = Date.now();
  for (const [key, entry] of catalogCache) if (entry.expires <= now) catalogCache.delete(key);
  let entry = catalogCache.get(bin);
  if (!entry) {
    entry = { expires: now + 60_000, value: loadCodexModels(bin) };
    catalogCache.set(bin, entry);
  }
  return entry.value;
}

export async function codexSelection(context: AppContext) {
  const [settings, bin] = await Promise.all([context.store.readSettings(), context.codexPath()]);
  const catalog = await readCodexModels(bin);
  const catalogSlugs = catalog.source === "codex-cli" ? catalog.models.map(model => model.slug) : [];
  return {
    bin, model: resolveCodexModel(settings.codexModel, catalogSlugs),
    effort: typeof settings.codexEffort === "string" && settings.codexEffort ? settings.codexEffort : "medium",
    catalogSlugs, resolved: catalog.source === "codex-cli",
    savedModel: typeof settings.codexModel === "string" && settings.codexModel ? settings.codexModel : undefined,
  };
}

export async function withCodexModelFallback<T>(context: AppContext, run: (model: string) => Promise<T>): Promise<{ value: T; model: string; switchedFrom?: string }> {
  const selection = await codexSelection(context);
  if (!selection.bin) throw new HttpError(503, "codex-not-found", "Codex CLI를 찾지 못했습니다");
  const original = selection.savedModel ?? selection.model;
  const failed: string[] = [], usage: Record<string, number> = {};
  let model = selection.model;
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await run(model);
      const settings = await context.store.readSettings();
      if (settings.codexModel !== model) await context.store.saveSettings({ ...settings, codexModel: model });
      return { value, model, ...(model !== original ? { switchedFrom: original } : {}) };
    } catch (error) {
      if (!(error instanceof CodexModelUnavailableError)) throw error;
      failed.push(model);
      for (const [unit, amount] of Object.entries(error.usage)) usage[unit] = (usage[unit] ?? 0) + amount;
      const next = nextCodexModel(failed, selection.catalogSlugs);
      if (attempt >= 2 || !next) throw new CodexError("이 계정에서 쓸 수 있는 codex 모델이 없어요. codex 를 업데이트하거나 ChatGPT 플랜을 확인하세요", usage);
      model = next;
    }
  }
}

export function codexModelSwitchMessage(result: { model: string; switchedFrom?: string }): string | undefined {
  return result.switchedFrom ? `모델 ${result.switchedFrom} 를 쓸 수 없어 ${result.model} 로 바꿨어요` : undefined;
}
