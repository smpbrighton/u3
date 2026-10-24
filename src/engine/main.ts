import { createInterface } from "node:readline";
import { serve } from "@hono/node-server";
import { Store } from "./store";
import { Jobs } from "./jobs";
import { createApp } from "./app";
import { findCodexPath } from "./pipeline/codex-path";
import path from "node:path";
import { bgeM3Embedder, memeIndex } from "./pipeline/meme-embed";
import { startMediaServer } from "./pipeline/media-server";

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
const store = new Store(); await store.init();
const tauriOrigin = process.env.TAURI_ORIGIN ?? "tauri://localhost";
const configuredLibraryRoot = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
const libraryRoot = path.basename(configuredLibraryRoot) === "library"
  ? configuredLibraryRoot
  : path.join(configuredLibraryRoot, "library");
const mediaServer = await startMediaServer({
  roots: { projects: path.join(store.root, "projects"), library: libraryRoot },
  token,
  allowedOrigin: tauriOrigin,
});
const app = createApp({
  store,
  jobs: new Jobs(),
  token,
  tauriOrigin,
  codexPath: () => findCodexPath(store),
  jevAvailable: !!process.env.TYPESAFE_API_KEY,
  memeIndex: memeIndex(store.root, bgeM3Embedder({ cacheDir: path.join(store.root, "cache/models") }), () => import("./pipeline/library").then(({ listMemes }) => listMemes(libraryRoot))),
  mediaServer,
});
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, info => process.stdout.write(`PORT ${info.port}\n`));
