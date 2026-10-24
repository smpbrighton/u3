// 렌더용 로컬 미디어 서버(구현 중 변경: 계획에 없던 모듈).
// Remotion 번들은 publicDir(assets/)만 staticFile로 읽는다. 사용자 데이터(data/)의 음성·에셋·짤·효과음은
// 이 서버로 내보내 URL로 넘긴다. @remotion/media의 <Video>·<Audio>는 fetch로 Range 요청을 하므로
// CORS 헤더와 206 응답이 필요하다. 127.0.0.1에만 묶고, 루트 밖 경로는 403이다.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
const encodeRelPath = (rel: string) => rel.split(path.sep).map(encodeURIComponent).join("/");

export interface MediaServerOptions {
  /** URL 접두사 → 디렉터리. 예: { data: "/…/data", assets: "/…/assets" } */
  roots: Record<string, string>;
  port?: number;
  token?: string;
  allowedOrigin?: string;
}

export interface MediaServer {
  origin: string;
  /** 접두사와 루트 기준 상대 경로로 URL을 만든다. 세그먼트마다 인코딩한다(한글 폴더 이름). */
  url(prefix: string, rel: string, token?: string): string;
  close(): Promise<void>;
}

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".ico": "image/x-icon",
};

export function contentTypeOf(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export function mediaUrl(projectId: string, relative: string, token?: string, origin = ""): string {
  const file = relative.split(path.sep).map(encodeURIComponent).join("/");
  const url = `${origin}/api/media/projects/${encodeURIComponent(projectId)}/${file}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export { encodeRelPath };

/** 요청 경로를 루트 안의 절대 경로로 푼다. 루트 밖이거나 잘못된 인코딩이면 null. */
export function resolveUnder(root: string, relEncoded: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(relEncoded);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const abs = path.resolve(root, "./" + rel);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

/** "bytes=a-b" 하나만 지원한다. 범위가 틀리면 "invalid", 헤더가 없으면 null. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  const [, a, b] = m;
  let start: number;
  let end: number;
  if (a === "" && b === "") return "invalid";
  if (a === "") {
    const suffix = Number(b);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

export const MEDIA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export async function startMediaServer(opts: MediaServerOptions): Promise<MediaServer> {
  const roots = new Map(Object.entries(opts.roots).map(([k, v]) => [k, path.resolve(v)]));

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body = "") => {
      res.writeHead(status, { ...MEDIA_CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      if (req.headers.origin && opts.allowedOrigin && req.headers.origin !== opts.allowedOrigin) return send(403, "forbidden origin");
      if (req.method === "OPTIONS") {
        res.writeHead(204, MEDIA_CORS_HEADERS);
        res.end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, "method not allowed");
      if (opts.token && new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("token") !== opts.token) return send(401, "unauthorized");
      const pathname = (req.url ?? "/").split("?")[0]!;
      const m = /^\/([^/]+)\/(.+)$/.exec(pathname);
      const root = m ? roots.get(m[1]!) : undefined;
      if (!m || !root) return send(404, "not found");
      const file = resolveUnder(root, m[2]!);
      if (!file) return send(403, "forbidden");
      let size: number;
      try {
        const st = await stat(file);
        if (!st.isFile()) return send(404, "not found");
        size = st.size;
      } catch {
        return send(404, "not found");
      }
      const headers: Record<string, string | number> = {
        ...MEDIA_CORS_HEADERS,
        "Content-Type": contentTypeOf(file),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };
      const range = parseRange(req.headers.range, size);
      if (range === "invalid") {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      const { start, end } = range ?? { start: 0, end: size - 1 };
      const status = range ? 206 : 200;
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      headers["Content-Length"] = size === 0 ? 0 : end - start + 1;
      res.writeHead(status, headers);
      if (req.method === "HEAD" || size === 0) {
        res.end();
        return;
      }
      const stream = createReadStream(file, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) send(500, "error");
      else res.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    url: (prefix, rel, token) => {
      if (!roots.has(prefix)) throw new Error(`알 수 없는 미디어 접두사: ${prefix}`);
      const url = `${origin}/${prefix}/${encodeRelPath(rel)}`;
      const key = token ?? opts.token;
      return key ? `${url}?token=${encodeURIComponent(key)}` : url;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
