// 파일 저장소. uUu src/server/store.ts의 키별 잠금과 임시 파일 rename 저장을 옮겼다.
import { randomBytes } from "node:crypto";
import { readFile, readdir, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrateLibraryReference } from "../core/library-reference";
import { Project } from "../core/schema";
import { HttpError } from "./http";

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

function migrateProjectLibraryReferences(project: Project): Project {
  const sfx = project.timeline.sfx.map(clip => {
    const file = migrateLibraryReference(clip.file);
    return file ? { ...clip, file } : clip;
  });
  return sfx.every((clip, index) => clip === project.timeline.sfx[index])
    ? project
    : { ...project, timeline: { ...project.timeline, sfx } };
}

const pad = (value: number) => String(value).padStart(2, "0");
export function newProjectId(now: Date): string {
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${day}-${time}-${randomBytes(2).toString("hex")}`;
}

export class Store {
  private chains = new Map<string, Promise<unknown>>();

  constructor(
    readonly root = process.env.U3_DATA_DIR ?? path.join(os.homedir(), "Library/Application Support/U3"),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 같은 key의 읽기·고치기·쓰기를 차례대로 실행한다. */
  lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.chains.set(key, tail);
    void tail.then(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return run;
  }

  projectDir(id: string): string {
    return path.join(this.root, "projects", id);
  }

  async init(): Promise<void> {
    await Promise.all([
      mkdir(path.join(this.root, "projects"), { recursive: true }),
      mkdir(path.join(this.root, "cache/models"), { recursive: true }),
    ]);
    try {
      await readFile(path.join(this.root, "settings.json"), "utf8");
    } catch {
      await writeJsonAtomic(path.join(this.root, "settings.json"), {});
    }
  }

  async ensureProject(id: string): Promise<void> {
    await Promise.all(["input", "voice", "stems", "transcripts"].map(directory =>
      mkdir(path.join(this.projectDir(id), directory), { recursive: true }),
    ));
  }

  async listProjects(): Promise<Project[]> {
    const folders = await readdir(path.join(this.root, "projects"), { withFileTypes: true }).catch(() => []);
    const projects: Project[] = [];
    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      try {
        const project = migrateProjectLibraryReferences(Project.parse(JSON.parse(await readFile(path.join(this.projectDir(folder.name), "project.json"), "utf8"))));
        if (project.id === folder.name) projects.push(project);
      } catch {
        // 잘못된 project.json은 목록에서 제외한다.
      }
    }
    return projects.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
  }

  private async readProject(id: string): Promise<Project | null> {
    let content: string;
    try {
      content = await readFile(path.join(this.projectDir(id), "project.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new HttpError(500, "broken-project", `project.json이 JSON 형식이 아닙니다: ${id}`);
    }
    const parsed = Project.safeParse(raw);
    if (!parsed.success) throw new HttpError(500, "broken-project", `project.json 형식이 맞지 않습니다: ${id}`);
    return parsed.data.id === id ? migrateProjectLibraryReferences(parsed.data) : null;
  }

  async getProject(id: string): Promise<Project | null> {
    return this.readProject(id);
  }

  async requireProject(id: string): Promise<Project> {
    const project = await this.getProject(id);
    if (!project) throw new HttpError(404, "not-found", `프로젝트가 없습니다: ${id}`);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    if (!/^\d{8}-\d{6}-[a-f0-9]{4}$/.test(id)) throw new HttpError(400, "invalid-id", "프로젝트 id가 올바르지 않습니다");
    await this.lock(`project:${id}`, async () => {
      const project = await this.readProject(id);
      if (!project) throw new HttpError(404, "not-found", `프로젝트가 없습니다: ${id}`);
      await rm(this.projectDir(id), { recursive: true, force: false });
    });
  }

  async saveProject(value: Project): Promise<Project> {
    const project = migrateProjectLibraryReferences(Project.parse(value));
    await this.lock(`project:${project.id}`, async () => {
      await this.ensureProject(project.id);
      await writeJsonAtomic(path.join(this.projectDir(project.id), "project.json"), project);
    });
    return project;
  }

  async createProject(name: string): Promise<Project> {
    const now = this.now();
    const project = Project.parse({
      id: newProjectId(now),
      name,
      inputs: [{ id: "placeholder", kind: "photo", file: "pending" }],
      timeline: {
        video: [], captions: [], voice: [], sfx: [],
        audio: {
          source: { gain: 1, muted: false },
          voice: { gain: 1, muted: false },
          sfx: { gain: 1, muted: false },
        },
      },
      savedAt: now.toISOString(),
    });
    await this.lock(`project:${project.id}`, async () => {
      if (await this.getProject(project.id)) throw new HttpError(409, "exists", `같은 id의 프로젝트가 있습니다: ${project.id}`);
      await this.ensureProject(project.id);
      await writeJsonAtomic(path.join(this.projectDir(project.id), "project.json"), project);
    });
    return project;
  }

  async readSettings(): Promise<Record<string, unknown>> {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(this.root, "settings.json"), "utf8"));
      return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  async saveSettings(value: Record<string, unknown>): Promise<void> {
    await this.lock("settings", () => writeJsonAtomic(path.join(this.root, "settings.json"), value));
  }
}
