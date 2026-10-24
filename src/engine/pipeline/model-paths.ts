import type { Store } from "../store";

export type ModelPathKey = "mrx" | "whisperCli" | "silero";

export async function configuredModelPath(store: Store, key: ModelPathKey, fallback: string): Promise<string> {
  const settings = await store.readSettings();
  const paths = settings.modelPaths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return fallback;
  const value = (paths as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
