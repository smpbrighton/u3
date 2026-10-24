import { describe,expect,it } from "vitest";
import { createApp } from "../../src/engine/app";
import { Store } from "../../src/engine/store";
import { Jobs } from "../../src/engine/jobs";
describe("sidecar request gates",()=>{it("returns 401 without the one-time token",async()=>{const app=createApp({store:new Store("/tmp/u3-test-store"),jobs:new Jobs(),token:"secret",tauriOrigin:"tauri://localhost",codexPath:async()=>null,jevAvailable:false});const r=await app.request("http://127.0.0.1/api/health");expect(r.status).toBe(401);});it("rejects an origin outside the Tauri webview",async()=>{const app=createApp({store:new Store("/tmp/u3-test-store"),jobs:new Jobs(),token:"secret",tauriOrigin:"tauri://localhost",codexPath:async()=>null,jevAvailable:false});const r=await app.request("http://127.0.0.1/api/health",{headers:{authorization:"Bearer secret",origin:"https://evil.example"}});expect(r.status).toBe(403);});});
