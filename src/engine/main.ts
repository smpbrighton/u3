import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { Store } from "./store";
import { Jobs } from "./jobs";
import { createApp } from "./app";
import { findCodexPath } from "./pipeline/codex-path";
import path from "node:path";
import { bgeM3Embedder, memeIndex } from "./pipeline/meme-embed";

// Tauri는 U3_TOKEN 환경 변수로 일회용 토큰을 주입한다. 개발 실행은 stdin 첫 줄에서 읽는다.
async function readToken(): Promise<string> {
  if (process.env.U3_TOKEN) return process.env.U3_TOKEN;
  if (process.stdin.isTTY) return randomBytes(32).toString("hex");
  return new Promise((resolve,reject)=>{ let data=""; process.stdin.setEncoding("utf8"); process.stdin.once("data", chunk=>{data+=chunk;resolve(data.trim());}); process.stdin.once("error",reject); });
}
const token = await readToken();
if (!token) throw new Error("U3_TOKEN이 비어 있습니다");
const store = new Store(); await store.init();
const app = createApp({ store, jobs: new Jobs(), token, tauriOrigin: process.env.TAURI_ORIGIN, codexPath: () => findCodexPath(store), jevAvailable: !!process.env.TYPESAFE_API_KEY, memeIndex: memeIndex(store.root,bgeM3Embedder({cacheDir:path.join(store.root,"cache/models")})) });
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, info => process.stdout.write(`PORT ${info.port}\n`));
