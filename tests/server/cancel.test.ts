import { describe, expect, it } from "vitest";
import { createApp } from "../../src/engine/app";
import { Jobs } from "../../src/engine/jobs";
import { Store } from "../../src/engine/store";

describe("queued job cancellation", () => {
  it("aborts the running task and keeps its cancelled state", async () => {
    const jobs = new Jobs();
    const app = createApp({ store: new Store("/tmp/u3-cancel"), jobs, token: "token", codexPath: async () => null, jevAvailable: false });
    let signal: AbortSignal | undefined;
    const job = jobs.enqueue("느린 작업", async context => {
      signal = context.signal;
      await new Promise<void>(resolve => context.signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const response = await app.request(`http://127.0.0.1/api/jobs/${job.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });
    expect(response.status).toBe(200);
    expect(signal?.aborted).toBe(true);
    expect(jobs.get(job.id)?.status).toBe("discarded");
  });
});
