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
    jevAvailable: false,
  });
}

describe("sidecar token and Origin checks", () => {
  it("returns 401 when the request has no token", async () => {
    const response = await createTestApp().request("http://127.0.0.1/api/health");
    expect(response.status).toBe(401);
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
