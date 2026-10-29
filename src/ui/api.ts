import { invoke, isTauri } from "@tauri-apps/api/core";
import { libraryReferencePath } from "../core/library-reference";

type EngineConnection = { port: number; token: string };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let connectionPromise: Promise<EngineConnection> | null = null;

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

async function connection(): Promise<EngineConnection> {
  if (connectionPromise) return connectionPromise;
  connectionPromise = isTauri()
    ? invoke<EngineConnection>("engine_connection")
    : Promise.resolve({
      port: Number(import.meta.env.VITE_ENGINE_PORT),
      token: import.meta.env.VITE_ENGINE_TOKEN ?? "",
    });
  return connectionPromise;
}

export function resetConnection(): void {
  connectionPromise = null;
}

export async function apiUrl(path: string): Promise<string> {
  if (!isTauri() || import.meta.env.DEV) return path;
  const engine = await connection();
  return `http://127.0.0.1:${engine.port}${path}`;
}

function requestHeaders(engine: EngineConnection): Headers {
  const headers = new Headers({ authorization: `Bearer ${engine.token}` });
  if (isTauri() && import.meta.env.DEV) headers.set("x-u3-engine-port", String(engine.port));
  return headers;
}

export async function api<T = void>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const [engine, url] = await Promise.all([connection(), apiUrl(path)]);
  const headers = requestHeaders(engine);
  const init: RequestInit = { method, headers, signal };
  if (body !== undefined) {
    if (body instanceof FormData) init.body = body;
    else {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    resetConnection();
    throw new Error(`엔진에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string; [key: string]: unknown } } | null)?.error;
    const { message, code, ...details } = error ?? {};
    throw new ApiError(message ?? `요청에 실패했습니다 (${response.status})`, code, details);
  }
  return data as T;
}

export async function mediaUrl(projectId: string, relativePath: string): Promise<string> {
  const engine = await connection();
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  if (import.meta.env.DEV) return `/api/media/projects/${encodeURIComponent(projectId)}/${encoded}?token=${encodeURIComponent(engine.token)}`;
  return `http://127.0.0.1:${engine.port}/api/media/projects/${encodeURIComponent(projectId)}/${encoded}?token=${encodeURIComponent(engine.token)}`;
}

export async function libraryMediaUrl(reference: string): Promise<string> {
  const relativePath = libraryReferencePath(reference);
  if (!relativePath) throw new Error("라이브러리 미디어 참조가 올바르지 않습니다");
  const engine = await connection();
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  const origin = isTauri() && !import.meta.env.DEV ? `http://127.0.0.1:${engine.port}` : "";
  return `${origin}/api/media/library/${encoded}?token=${encodeURIComponent(engine.token)}`;
}

export async function brandMediaUrl(relativePath: string): Promise<string> {
  const engine = await connection();
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  const origin = isTauri() && !import.meta.env.DEV ? `http://127.0.0.1:${engine.port}` : "";
  return `${origin}/api/media/brand/${encoded}?token=${encodeURIComponent(engine.token)}`;
}

export async function carouselFileUrl(carouselId: string, relativePath: string): Promise<string> {
  const engine = await connection();
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  const origin = isTauri() && !import.meta.env.DEV ? `http://127.0.0.1:${engine.port}` : "";
  return `${origin}/api/media/carousels/${encodeURIComponent(carouselId)}/${encoded}?token=${encodeURIComponent(engine.token)}`;
}

export interface EngineJob {
  id: string;
  kind: string;
  label?: string;
  projectId: string | null;
  sceneIndex?: number | null;
  status: "queued" | "running" | "done" | "failed" | "discarded";
  progress: number | null;
  message: string | null;
  error: string | null;
  result: unknown;
  cancellable: boolean;
}

export async function watchJob(
  jobId: string,
  onUpdate: (job: EngineJob) => void,
  signal: AbortSignal,
): Promise<EngineJob> {
  const [engine, url] = await Promise.all([connection(), apiUrl("/api/events")]);
  const response = await fetch(url, { headers: requestHeaders(engine), signal });
  if (!response.ok || !response.body) throw new Error("진행 상태를 불러오지 못했습니다");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest: EngineJob | undefined;
  const consume = (block: string) => {
    const dataLine = block.split("\n").find(line => line.startsWith("data: "));
    if (!dataLine) return;
    const event = JSON.parse(dataLine.slice(6)) as EngineJob | { jobs: EngineJob[] };
    const jobs = Array.isArray((event as { jobs?: EngineJob[] }).jobs)
      ? (event as { jobs: EngineJob[] }).jobs
      : [event as EngineJob];
    for (const job of jobs) {
      if (job.id !== jobId) continue;
      latest = job;
      onUpdate(job);
      if (["done", "failed", "discarded"].includes(job.status)) throw job;
    }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        consume(block);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) return error as EngineJob;
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (latest) return latest;
  throw new Error("작업이 끝나기 전에 진행 연결이 닫혔습니다");
}

export async function watchJobs(onUpdate: (jobs: EngineJob[]) => void, signal: AbortSignal): Promise<void> {
  const [engine, url] = await Promise.all([connection(), apiUrl("/api/events")]);
  const response = await fetch(url, { headers: requestHeaders(engine), signal });
  if (!response.ok || !response.body) throw new Error("진행 상태를 불러오지 못했습니다");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = block.split("\n").find(line => line.startsWith("data: "));
        if (dataLine) {
          const event = JSON.parse(dataLine.slice(6)) as EngineJob | { jobs: EngineJob[] };
          onUpdate("jobs" in event ? event.jobs : [event]);
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
