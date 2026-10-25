import type { Hono } from "hono";
import { stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../http";

export function registerOutputRoutes(app: Hono): void {
  app.get("/api/output-exists", async c => {
    const outputPath = c.req.query("path")?.trim() ?? "";
    if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== ".mp4") {
      throw new HttpError(400, "invalid-output", "내보낼 mp4의 절대 경로를 지정해야 합니다");
    }
    try {
      return c.json({ exists: (await stat(outputPath)).isFile() });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return c.json({ exists: false });
      throw error;
    }
  });
}
