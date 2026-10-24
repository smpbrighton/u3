import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRange, resolveUnder, startMediaServer, type MediaServer } from "../../src/engine/pipeline/media-server";

let dir: string;
let srv: MediaServer;
const BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uuu-media-"));
  await mkdir(path.join(dir, "data/library/memes/당황"), { recursive: true });
  await writeFile(path.join(dir, "data/library/memes/당황/m 1.mp4"), BYTES);
  await writeFile(path.join(dir, "secret.txt"), "no");
  srv = await startMediaServer({ roots: { data: path.join(dir, "data") } });
});

afterAll(async () => {
  await srv.close();
  await rm(dir, { recursive: true, force: true });
});

describe("미디어 서버", () => {
  it("한글·공백 경로를 인코딩해 내보내고 CORS 헤더를 단다", async () => {
    const url = srv.url("data", "library/memes/당황/m 1.mp4");
    expect(url).toContain("%EB%8B%B9%ED%99%A9/m%201.mp4");
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await r.arrayBuffer()).equals(BYTES)).toBe(true);
  });

  it("Range 요청에 206과 해당 바이트를 준다", async () => {
    const url = srv.url("data", "library/memes/당황/m 1.mp4");
    const r = await fetch(url, { headers: { Range: "bytes=10-19" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 10-19/256");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const tail = await fetch(url, { headers: { Range: "bytes=-6" } });
    expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([250, 251, 252, 253, 254, 255]);
    const bad = await fetch(url, { headers: { Range: "bytes=300-" } });
    expect(bad.status).toBe(416);
  });

  it("루트 밖 경로와 모르는 접두사를 막는다", async () => {
    // fetch는 "%2e%2e" 세그먼트를 ".."로 정규화하므로, 슬래시까지 인코딩해 서버에 그대로 보낸다.
    const trav = await fetch(`${srv.origin}/data/..%2Fsecret.txt`);
    expect(trav.status).toBe(403);
    expect((await fetch(`${srv.origin}/other/x`)).status).toBe(404);
    expect((await fetch(`${srv.origin}/data/none.mp4`)).status).toBe(404);
    expect(() => srv.url("other", "x")).toThrow();
  });

  it("OPTIONS는 204, HEAD는 본문 없이 길이만 준다", async () => {
    const url = srv.url("data", "library/memes/당황/m 1.mp4");
    const o = await fetch(url, { method: "OPTIONS" });
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-headers")).toContain("Range");
    const h = await fetch(url, { method: "HEAD" });
    expect(h.status).toBe(200);
    expect(h.headers.get("content-length")).toBe("256");
  });

  it("범위·경로 파서", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=5-100", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=0-1,3-4", 10)).toBe("invalid");
    expect(resolveUnder("/r", "a/b.mp4")).toBe(path.resolve("/r/a/b.mp4"));
    expect(resolveUnder("/r", "..%2Fx")).toBeNull();
    expect(resolveUnder("/r", "%E0%A4%A")).toBeNull();
  });

  it("checks the one-time token and rejects a different Origin", async () => {
    const secure = await startMediaServer({
      roots: { data: path.join(dir, "data") },
      token: "sidecar-secret",
      allowedOrigin: "tauri://localhost",
    });
    try {
      const url = secure.url("data", "library/memes/당황/m 1.mp4");
      expect((await fetch(url)).status).toBe(200);
      expect((await fetch(url.replace("?token=sidecar-secret", ""))).status).toBe(401);
      expect((await fetch(url, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await secure.close();
    }
  });
});
