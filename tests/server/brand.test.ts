import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";
import { registerRenderRoutes } from "../../src/engine/routes/render";
import { Hono } from "hono";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

async function appAt() {
  const root = await mkdtemp(path.join(os.tmpdir(), "u3-brand-api-"));
  roots.push(root);
  const store = new Store(root);
  await store.init();
  return { app: createApp({ store, jobs: new Jobs(), token: "test-token", codexPath: async () => null, jevAvailable: false }), store, root };
}

function pngFixture() {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(2, 16);
  png.writeUInt32BE(3, 20);
  return png;
}

describe("brand settings and watermark API", () => {
  it("returns defaults, persists valid settings, and rejects invalid colors and ranges", async () => {
    const { app, store } = await appAt();
    const initial = await app.request("http://127.0.0.1/api/system/brand", { headers });
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ titleBar: { height: 160, bgColor: "#000000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#FFFFFF" } });

    const value = { watermark: { file: "watermark.png", x: 0.4, y: 0.08, width: 0.2, opacity: 0.75 }, titleBar: { height: 180, bgColor: "#123ABC", bgOpacity: 0.4, font: "gmarket", fontSize: 48, color: "#abcdef" } };
    const saved = await app.request("http://127.0.0.1/api/system/brand", { method: "PUT", headers, body: JSON.stringify(value) });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ...value, titleBar: { ...value.titleBar, kind: "text", text: "" } });
    expect(await store.readSettings()).toMatchObject({ brand: value });

    for (const invalid of [
      { ...value, titleBar: { ...value.titleBar, bgColor: "red" } },
      { ...value, titleBar: { ...value.titleBar, color: "#12345" } },
      { ...value, watermark: { ...value.watermark, opacity: 1.1 } },
      { ...value, titleBar: { ...value.titleBar, bgOpacity: -0.1 } },
    ]) {
      const response = await app.request("http://127.0.0.1/api/system/brand", { method: "PUT", headers, body: JSON.stringify(invalid) });
      expect(response.status).toBe(400);
    }
  });

  it("copies a validated image into the data brand directory and rejects unsupported files", async () => {
    const { app, root, store } = await appAt();
    const source = path.join(root, "picked.png");
    const bytes = pngFixture();
    await writeFile(source, bytes);
    const uploaded = await app.request("http://127.0.0.1/api/system/brand/watermark", { method: "POST", headers, body: JSON.stringify({ path: source }) });
    expect(uploaded.status).toBe(200);
    const result = await uploaded.json() as { file: string };
    expect(result.file).toBe("watermark.png");
    expect(await readFile(path.join(root, "brand", result.file))).toEqual(bytes);
    expect(await store.readSettings()).toMatchObject({ brand: { watermark: { file: "watermark.png" } } });

    const unsupported = path.join(root, "picked.gif");
    await writeFile(unsupported, Buffer.from("GIF89a"));
    const rejected = await app.request("http://127.0.0.1/api/system/brand/watermark", { method: "POST", headers, body: JSON.stringify({ path: unsupported }) });
    expect(rejected.status).toBe(400);
  });

  it("passes configured brand settings to the export renderer", async () => {
    const { store, root } = await appAt();
    const timeline = {
      video: [{ id: "clip-1", kind: "main" as const, inputId: "input-1", durationSec: 2 }],
      overlays: [], captions: [], voice: [], sfx: [],
      audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } },
    };
    await store.saveProject({ id: "20261026-120000-abcd", name: "브랜드 테스트", inputs: [{ id: "input-1", kind: "video", file: "input.mp4" }], timeline, savedAt: new Date().toISOString() });
    await store.saveSettings({ brand: { watermark: { file: "watermark.png", x: 0.5, y: 0.1, width: 0.2, opacity: 1 }, titleBar: { height: 160, bgColor: "#000000", bgOpacity: 0.62, font: "pretendard", fontSize: 56, color: "#FFFFFF" } } });
    const rendered = vi.fn(async () => undefined);
    const jobs = new Jobs();
    const app = new Hono();
    registerRenderRoutes(app, { store, jobs, token: "test-token", codexPath: async () => null, jevAvailable: false }, rendered);

    const response = await app.request("http://127.0.0.1/api/projects/20261026-120000-abcd/render", { method: "POST", headers, body: JSON.stringify({ outputPath: path.join(root, "out.mp4") }) });
    expect(response.status).toBe(202);
    const result = await response.json() as { id: string };
    await jobs.wait(result.id);
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ brand: expect.objectContaining({ watermark: expect.objectContaining({ file: "watermark.png" }) }) }));
  });
});

describe("타이틀 이미지 API", () => {
  it("전용 이미지 한 장을 저장하고 지워도 워터마크와 글·스타일은 유지한다", async () => {
    const {app,store,root} = await appAt();
    const initial = await (await app.request("/api/system/brand",{headers})).json();
    await store.saveSettings({brand:{...initial,watermark:{file:"watermark.png",x:.5,y:.1,width:.2,opacity:1},titleBar:{...initial.titleBar,text:"기본 제목",height:220}}});
    const source = path.join(root,"title.png");
    await writeFile(source,pngFixture());
    const uploaded = await app.request("/api/system/brand/title-image",{method:"POST",headers,body:JSON.stringify({path:source})});
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toMatchObject({file:"title.png",watermark:{file:"watermark.png"},titleBar:{kind:"image",file:"title.png",text:"기본 제목",height:220}});
    expect(await readFile(path.join(root,"brand/title.png"))).toEqual(pngFixture());
    const deleted = await app.request("/api/system/brand/title-image",{method:"DELETE",headers});
    expect(deleted.status).toBe(200);
    const result = await deleted.json();
    expect(result.titleBar).not.toHaveProperty("file");
    expect(result).toMatchObject({watermark:{file:"watermark.png"},titleBar:{text:"기본 제목",height:220}});
    await expect(readFile(path.join(root,"brand/title.png"))).rejects.toThrow();
  });
  it("지원하지 않는 파일과 잘못된 이미지의 업로드를 거부한다",async()=>{
    const {app,root} = await appAt();
    for(const name of ["bad.gif","bad.png"]){
      const source=path.join(root,name);await writeFile(source,"GIF89a");
      expect((await app.request("/api/system/brand/title-image",{method:"POST",headers,body:JSON.stringify({path:source})})).status).toBe(400);
    }
  });
});
