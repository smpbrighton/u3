import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

export class HttpError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 503, readonly code: string, message: string) { super(message); }
}
export const errorBody = (code: string, message: string) => ({ error: { code, message } });
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "invalid", z.prettifyError(parsed.error));
  return parsed.data;
}
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let value: unknown;
  try { value = await c.req.json(); } catch { throw new HttpError(400, "bad-json", "JSON 본문이 아닙니다"); }
  return validate(schema, value);
}
const LOCAL = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
export function isLocalHostname(host: string): boolean { return LOCAL.has(host) || host.endsWith(".localhost"); }
export function localOnly(tauriOrigin?: string): MiddlewareHandler {
  return async (c, next) => {
    if (!isLocalHostname(new URL(c.req.url).hostname)) throw new HttpError(403, "forbidden-host", "로컬 주소로만 접속할 수 있습니다");
    const origin = c.req.header("origin");
    if (origin && origin !== tauriOrigin && !(!tauriOrigin && (origin === "tauri://localhost" || origin === "http://tauri.localhost"))) throw new HttpError(403, "forbidden-origin", "허용되지 않은 Origin입니다");
    await next();
  };
}
export function tokenGuard(token: string): MiddlewareHandler {
  return async (c, next) => {
    const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-u3-token") ?? (c.req.path.startsWith("/api/media/") ? c.req.query("token") : undefined);
    if (got !== token) throw new HttpError(401, "unauthorized", "유효한 일회용 토큰이 필요합니다");
    await next();
  };
}
