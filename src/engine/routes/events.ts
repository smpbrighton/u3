import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "../app";

export function registerEventRoutes(app: Hono, context: AppContext): void {
  app.get("/api/events", c => {
    c.header("cache-control", "no-store");
    return streamSSE(c, async stream => {
      const unsubscribe = context.jobs.subscribe(job => {
        if (!stream.aborted && !stream.closed) {
          void stream.writeSSE({ event: "job", data: JSON.stringify(job) }).catch(() => undefined);
        }
      });
      const keepAlive = setInterval(() => {
        if (!stream.aborted && !stream.closed) {
          void stream.writeSSE({ event: "ping", data: JSON.stringify({ at: Date.now() }) }).catch(() => undefined);
        }
      }, 15_000);

      await stream.writeSSE({ event: "ready", data: JSON.stringify({ jobs: context.jobs.list() }) });
      await new Promise<void>(resolve => {
        stream.onAbort(() => {
          clearInterval(keepAlive);
          unsubscribe();
          resolve();
        });
      });
    });
  });

  app.delete("/api/jobs/:id", c => c.json({ result: context.jobs.cancel(c.req.param("id")) }));
}
