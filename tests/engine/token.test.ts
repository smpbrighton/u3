import { describe, expect, it } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

function createTestApp() {
  return createApp({
    store: new Store("/tmp/u3-token-test"),
    jobs: new Jobs(),
    token: "secret",
    tauriOrigin: "tauri://localhost",
    codexPath: async () => null,
    jevKey: async () => null,
  });
}

describe("sidecar token and Origin checks", () => {
  it("answers an allowed CORS preflight without a token", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/system", {
      method: "OPTIONS",
      headers: {
        origin: "tauri://localhost",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
  });

  it("adds the allowed Origin to an authenticated response", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/health", {
      headers: {
        authorization: "Bearer secret",
        origin: "tauri://localhost",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
  });

  it("rejects a preflight from another Origin", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/system", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });

    expect(response.status).toBe(403);
  });

  it("returns 401 when the request has no token", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/health", {
      headers: { origin: "tauri://localhost" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
  });

  it("rejects an Origin outside the configured Tauri webview", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/health", {
      headers: {
        authorization: "Bearer secret",
        origin: "https://evil.example",
      },
    });
    expect(response.status).toBe(403);
  });
});
