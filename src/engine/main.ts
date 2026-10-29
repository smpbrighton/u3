import { createPromptDefaults } from "./prompt-defaults";
import { createInterface } from "node:readline";
import { serve } from "@hono/node-server";
import { Store } from "./store";
import { Jobs } from "./jobs";
import { createApp } from "./app";
import { findCodexPath } from "./pipeline/codex-path";
import path from "node:path";
import { bgeM3Embedder, memeIndex } from "./pipeline/meme-embed";
import { startMediaServer } from "./pipeline/media-server";
import { access, cp, mkdir, stat } from "node:fs/promises";
import { parseWhisperOutput } from "../core/transcript";
import { transcribeAudio } from "./pipeline/whisper";
import { bgeM3Ready, downloadBgeM3 } from "./pipeline/models";
import { done } from "./jobs";
import { configuredModelPath } from "./pipeline/model-paths";
import { installEngineShutdown } from "./shutdown";
import { renderCarouselSlide } from "./pipeline/render";
import { createJevKeyStore } from "./jev-key";
import { createDpapiKeyStore } from "./jev-key-win";
import { defaultOrigin, enginePlatform, exe } from "./platform";
import { installEngineLog } from "./engine-log";
import packageInfo from "../../package.json";

process.stdin.resume();

// Tauri는 U3_TOKEN 환경 변수로 일회용 토큰을 준다. 개발 실행은 stdin 첫 줄에서 읽는다.
async function readToken(): Promise<string> {
  if (process.env.U3_TOKEN) return process.env.U3_TOKEN;
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  return new Promise(resolve => {
    input.once("close", () => resolve(""));
    input.once("line", line => {
      resolve(line.trim());
      input.close();
    });
  });
}
const token = await readToken();
if (!token) throw new Error("U3_TOKEN이 비어 있습니다");
const store = new Store();
const logSecrets = new Set([token]);
const log = installEngineLog({ dir: path.join(store.root, "logs"), version: packageInfo.version, secrets: () => [...logSecrets] });
await store.init();
const prompts = createPromptDefaults({ dataDir: store.root, env: process.env, fetchImpl: fetch });
const stopPrompts = prompts.start();
const tauriOrigin = process.env.TAURI_ORIGIN ?? defaultOrigin();
const resourceRoot = process.env.U3_RESOURCE_DIR ?? path.join(process.cwd(), "resources");
const configuredLibraryRoot = process.env.U3_LIBRARY_DIR ?? path.join(resourceRoot, "library");
const libraryRoot = path.basename(configuredLibraryRoot) === "library"
  ? configuredLibraryRoot
  : path.join(configuredLibraryRoot, "library");
const resourceDir = path.dirname(libraryRoot);
const bundledIndex = path.join(resourceDir, "library/meme-embed");
const dataIndex = path.join(store.root, "cache/meme-embed");
try {
  await access(path.join(dataIndex, "bge-m3.json"));
} catch {
  try {
    await access(path.join(bundledIndex, "bge-m3.json"));
    await mkdir(path.dirname(dataIndex), { recursive: true });
    await cp(bundledIndex, dataIndex, { recursive: true, force: false });
  } catch {
    // The development server can start before resource files exist.
  }
}
const mediaServer = await startMediaServer({
  roots: { projects: path.join(store.root, "projects"), library: libraryRoot, carousels: path.join(store.root, "carousels"), brand: path.join(store.root, "brand") },
  token,
  allowedOrigin: tauriOrigin,
});
const whisperPath = process.env.U3_WHISPER_CLI ?? path.join(resourceDir, "bin", exe("whisper-cli"));
const sileroPath = process.env.U3_SILERO_MODEL ?? path.join(resourceDir, "models/ggml-silero-v6.2.0.bin");
const whisperModelPath = process.env.U3_WHISPER_MODEL ?? path.join(store.root, "cache/models/ggml-large-v3-turbo-q5_0.bin");
const transcribeInput = async ({ file, signal }: { file: string; inputId: string; signal?: AbortSignal }) => {
  const configuredWhisper = await configuredModelPath(store, "whisperCli", whisperPath);
  const configuredSilero = await configuredModelPath(store, "silero", sileroPath);
  const available = await Promise.all([configuredWhisper, configuredSilero, whisperModelPath].map(filePath => stat(filePath).then(info => info.isFile()).catch(() => false)));
  if (!available.every(Boolean)) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const json = await transcribeAudio({ file, whisperPath: configuredWhisper, modelPath: whisperModelPath, vadModelPath: configuredSilero, signal: controller.signal });
    return { text: parseWhisperOutput(json).map(word => `[${word.start.toFixed(2)}s] ${word.text}`).join(" ") };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { text: "", warning: error instanceof Error ? error.message : String(error) };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
};
const jobs = new Jobs();
const index = memeIndex(store.root, bgeM3Embedder({ cacheDir: path.join(store.root, "cache/models") }), () => import("./pipeline/library").then(({ listMemes }) => listMemes(libraryRoot)));
const keyStore = enginePlatform() === "win32"
  ? createDpapiKeyStore({ helperPath: process.env.U3_KEY_STORE_CLI ?? path.join(resourceDir, "bin/u3-key-store.exe"), filePath: path.join(store.root, "secrets/jev-key.dpapi") })
  : createJevKeyStore();
const jevKeyStore = {
  ...keyStore,
  readJevKey: async () => {
    const key = await keyStore.readJevKey();
    if (key) logSecrets.add(key);
    return key;
  },
  saveJevKey: async (key: string) => {
    logSecrets.add(key);
    await keyStore.saveJevKey(key);
  },
};
const app = createApp({
  log: log.write,
  promptDefaults: () => prompts.current(),
  store,
  jobs,
  token,
  tauriOrigin,
  codexPath: () => findCodexPath(store),
  jevKey: jevKeyStore.readJevKey,
  jevKeyStore,
  transcribeInput,
  memeIndex: index,
  mediaServer,
  resourceDir,
  whisperPath,
  sileroPath,
  mrxPath: process.env.U3_MRX_MODEL ?? path.join(resourceDir, "models/mrx.int8.onnx"),
  composeCarouselSlide: async (carousel, slide, destination) => {
    const asset = slide.background.kind === "generated"
      ? slide.background.image ?? slide.image
      : slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame;
    if (!asset) throw new Error("프레임 또는 이미지가 준비되지 않은 장입니다");
    await renderCarouselSlide({
      carousel,
      slide,
      imageUrl: mediaServer.url("carousels", `${carousel.id}/${asset.file}`),
      ...(slide.logo?.enabled ? { logoUrl: mediaServer.url("carousels", `${carousel.id}/${slide.logo.file}`) } : {}),
      outputPath: destination,
    });
  },
});
const bgeCache = path.join(store.root, "cache/models");
const bgeModel = path.join(bgeCache, "Xenova/bge-m3/onnx/model.onnx");
if (!(await bgeM3Ready(bgeCache))) {
  jobs.start({ kind: "models", label: "bge-m3 모델 받기", key: "model-download", cancellable: true }, async jobContext => {
    await downloadBgeM3({ cacheDir: bgeCache, signal: jobContext.signal, onProgress: progress => jobContext.progress(progress, "bge-m3 받는 중") });
    return done({ model: "bge-m3", path: bgeModel });
  });
}
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, info => process.stdout.write(`PORT ${info.port}\n`));
let serverClose: Promise<void> | null = null;
installEngineShutdown({
  jobs,
  stopAccepting: () => {
    stopPrompts();
    serverClose ??= new Promise<void>(resolve => server.close(() => resolve()));
  },
  close: async () => {
    await Promise.all([
      serverClose,
      mediaServer.close(),
      index.embedder.dispose?.(),
    ]);
  },
});
