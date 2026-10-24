// HTTP 공용 도우미. uUu src/server/http.ts의 오류·JSON·로컬 요청 경계를 옮겼다.
import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorBody(code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, ...details } };
}

export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HttpError) return c.json(errorBody(error.code, error.message, error.details), error.status);
  console.error("[engine]", error);
  return c.json(errorBody("internal", error.message || "서버 오류"), 500);
};

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "bad-json", "JSON 본문이 아닙니다");
  }
  return validate(schema, raw);
}

export function validate<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, "invalid", z.prettifyError(result.error));
  return result.data;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

/** uUu Host 검사에 Tauri Origin 허용 목록을 더했다. */
export function localOnly(tauriOrigin?: string): MiddlewareHandler {
  return async (c, next) => {
    const host = new URL(c.req.url).hostname;
    if (!isLocalHostname(host)) throw new HttpError(403, "forbidden-host", "로컬 주소로만 접속할 수 있습니다");
    const origin = c.req.header("origin");
    if (origin) {
      const allowed = tauriOrigin ? origin === tauriOrigin : ["tauri://localhost", "http://tauri.localhost"].includes(origin);
      if (!allowed) throw new HttpError(403, "forbidden-origin", "다른 출처의 요청은 받지 않습니다");
    }
    await next();
  };
}

export function cors(tauriOrigin?: string): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin) {
      const allowedOrigins = tauriOrigin ? [tauriOrigin] : ["tauri://localhost", "http://tauri.localhost"];
      if (!allowedOrigins.includes(origin)) throw new HttpError(403, "forbidden-origin", "다른 출처의 요청은 받지 않습니다");
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-headers", "authorization, content-type");
      c.header("access-control-allow-methods", "GET, POST, PUT, DELETE");
      c.header("vary", "Origin");
    }
    if (origin && c.req.method === "OPTIONS" && c.req.header("access-control-request-method")) return c.body(null, 204);
    await next();
  };
}

export function tokenGuard(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-u3-token");
    const mediaToken = c.req.path.startsWith("/api/media/") ? c.req.query("token") : undefined;
    if ((header ?? mediaToken) !== token) throw new HttpError(401, "unauthorized", "유효한 일회용 토큰이 필요합니다");
    await next();
  };
}
