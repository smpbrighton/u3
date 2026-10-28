import type { Hono } from "hono";
import path from "node:path";
import { z } from "zod";
import type { AppContext } from "../app";
import { done } from "../jobs";
import { HttpError, parseJson } from "../http";
import { renderShort } from "../pipeline/render";
import { BrandSettings, DEFAULT_BRAND_SETTINGS } from "../../core/schema";
import { requireHeavyMediaIdle } from "./tts";

import { prepareProjectAudio } from "../pipeline/audio-speed";

export function registerRenderRoutes(app: Hono, context: AppContext, render: (options: Parameters<typeof renderShort>[0]) => Promise<unknown> = renderShort): void {
  app.post("/api/projects/:id/render", async c => {
    const project = await context.store.getProject(c.req.param("id"));
    if (!project) throw new HttpError(404, "not-found", "프로젝트가 없습니다");
    const { outputPath } = await parseJson(c, z.object({ outputPath: z.string().trim().min(1) }));
    if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== ".mp4") {
      throw new HttpError(400, "invalid-output", "내보낼 mp4의 절대 경로를 지정해야 합니다");
    }
    const projectFolder = path.resolve(context.store.projectDir(project.id));
    const savedSettings = await context.store.readSettings();
    const parsedBrand = BrandSettings.safeParse(savedSettings.brand);
    const brand = parsedBrand.success ? parsedBrand.data : DEFAULT_BRAND_SETTINGS;
    const configuredLibrary = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources");
    const libraryFolder = path.resolve(path.basename(configuredLibrary) === "library" ? configuredLibrary : path.join(configuredLibrary, "library"));
    requireHeavyMediaIdle(context);
    const job = context.jobs.start({ kind: "render", projectId: project.id, label: "영상 내보내기", key: "heavy-media", cancellable: true }, async jobContext => {
      const resolveMediaUrl = (absolutePath: string) => {
        const brandFolder = path.resolve(context.store.root, "brand");
        if (absolutePath === brandFolder || absolutePath.startsWith(brandFolder + path.sep)) {
          return context.mediaServer?.url("brand", path.relative(brandFolder, absolutePath)) ?? absolutePath;
        }
        if (absolutePath === projectFolder || absolutePath.startsWith(projectFolder + path.sep)) {
          return context.mediaServer?.url("projects", `${project.id}/${path.relative(projectFolder, absolutePath)}`) ?? absolutePath;
        }
        if (absolutePath === libraryFolder || absolutePath.startsWith(libraryFolder + path.sep)) {
          return context.mediaServer?.url("library", path.relative(libraryFolder, absolutePath)) ?? absolutePath;
        }
        return absolutePath;
      };
      const audioCache = await prepareProjectAudio(projectFolder, project, jobContext.signal);
      await render({
        timeline: project.timeline,
        audioCache,
        brand,
        inputs: project.inputs,
        projectFolder,
        libraryFolder,
        outputPath,
        signal: jobContext.signal,
        resolveMediaUrl,
        onProgress: progress => jobContext.progress(progress.progress, "영상 내보내기 중"),
      });
      const latest = await context.store.requireProject(project.id);
      await context.store.saveProject({ ...latest, audioCache: { ...latest.audioCache, ...audioCache } });
      return done({ outputPath, audioCache });
    });
    return c.json(job, 202);
  });
}
