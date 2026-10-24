import type { Hono } from "hono";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppContext } from "../app";
import { done } from "../jobs";
import { HttpError, parseJson } from "../http";
import { bgeM3Ready, downloadBgeM3, downloadWhisper } from "../pipeline/models";
import { configuredModelPath } from "../pipeline/model-paths";

async function exists(file: string): Promise<boolean> {
  return stat(file).then(info => info.isFile()).catch(() => false);
}

export function registerModelRoutes(app: Hono, context: AppContext): void {
  app.get("/api/models", async c => {
    const modelRoot = path.join(context.store.root, "cache/models");
    const resourceRoot = context.resourceDir ?? path.join(process.cwd(), "resources");
    const bgeModel = path.join(modelRoot, "Xenova/bge-m3/onnx/model.onnx");
    const whisperModel = path.join(modelRoot, "ggml-large-v3-turbo-q5_0.bin");
    const [whisperCli, silero, mrx] = await Promise.all([
      configuredModelPath(context.store, "whisperCli", context.whisperPath ?? path.join(resourceRoot, "bin/whisper-cli")),
      configuredModelPath(context.store, "silero", context.sileroPath ?? path.join(resourceRoot, "models/ggml-silero-v6.2.0.bin")),
      configuredModelPath(context.store, "mrx", context.mrxPath ?? path.join(resourceRoot, "models/mrx.int8.onnx")),
    ]);
    return c.json({
      bgeM3: { available: await bgeM3Ready(modelRoot), path: bgeModel, ranking: await bgeM3Ready(modelRoot) ? "embedding" : "rules" },
      whisper: { available: await exists(whisperModel), path: whisperModel, sizeBytes: 574_041_195 },
      resources: { whisperCli: await exists(whisperCli), silero: await exists(silero), mrx: await exists(mrx) },
    });
  });

  app.post("/api/models/download", async c => {
    const { model } = await parseJson(c, z.object({ model: z.enum(["bge-m3", "whisper"]) }));
    const active = context.jobs.findActive("model-download");
    if (active) throw new HttpError(409, "model-download-active", "모델을 이미 받고 있습니다");
    const job = context.jobs.start({ kind: "models", label: `${model} 모델 받기`, key: "model-download", cancellable: true }, async jobContext => {
      const result = model === "bge-m3"
        ? await downloadBgeM3({ cacheDir: path.join(context.store.root, "cache/models"), signal: jobContext.signal, onProgress: progress => jobContext.progress(progress, "bge-m3 받는 중") })
        : await downloadWhisper({ cacheDir: path.join(context.store.root, "cache/models"), signal: jobContext.signal, onProgress: progress => jobContext.progress(progress, "whisper 모델 받는 중") });
      return done({ model, path: result });
    });
    return c.json(job, 202);
  });
}
