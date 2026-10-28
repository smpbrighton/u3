import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BUNDLED_PROMPT_DEFAULTS, PROMPT_SCHEMA, PromptDefaultsFile, type PromptDefaults } from "../core/default-prompts";
import { writeJsonAtomic } from "./store";

const MAX_RESPONSE_BYTES = 512 * 1024;
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function readDefaults(response: Response): Promise<PromptDefaults> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("프롬프트 응답이 512KB를 넘습니다");
  if (!response.body) throw new Error("프롬프트 응답이 비어 있습니다");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("프롬프트 응답이 512KB를 넘습니다");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return PromptDefaultsFile.parse(JSON.parse(Buffer.concat(chunks, size).toString("utf8")));
}

export function createPromptDefaults(options: {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}) {
  const installed = !!options.env.U3_RESOURCE_DIR;
  const url = installed
    ? `https://github.com/smpbrighton/u3/releases/download/prompts/prompts-schema-${PROMPT_SCHEMA}.json`
    : options.env.U3_PROMPTS_URL;
  const file = path.join(options.dataDir, "prompt-defaults.json");
  let cached: PromptDefaults | undefined;
  const ready = installed ? (async () => {
    try {
      cached = PromptDefaultsFile.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("[prompt-defaults] cache ignored", error);
    }
  })() : Promise.resolve();
  let pending: Promise<void> | undefined;
  let first: Promise<void> | undefined;
  let firstSettled = false;

  function refresh(): Promise<void> {
    if (!url) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        await ready;
        const response = await options.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
        const received = await readDefaults(response);
        if (received.revision <= (cached?.revision ?? 0)) return;
        if (installed) await writeJsonAtomic(file, received);
        cached = received;
      } catch (error) {
        console.error("[prompt-defaults] refresh ignored", error);
      }
    })().finally(() => { pending = undefined; });
    if (!first) {
      first = pending;
      void first.then(() => { firstSettled = true; });
    }
    return pending;
  }

  async function current(): Promise<PromptDefaults> {
    await ready;
    if (first && !firstSettled) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([first, new Promise<void>(resolve => { timeout = setTimeout(resolve, 3000); })]);
      } finally {
        clearTimeout(timeout);
      }
    }
    return cached && cached.revision > BUNDLED_PROMPT_DEFAULTS.revision ? cached : BUNDLED_PROMPT_DEFAULTS;
  }

  function start(): () => void {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    interval.unref();
    return () => clearInterval(interval);
  }

  return { current, refresh, start };
}
