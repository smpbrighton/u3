import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Project } from "../core/schema";

export const defaultStoreRoot = () => process.env.U3_DATA_DIR || path.join(os.homedir(), "Library/Application Support/U3");
async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}
export class Store {
  private chains = new Map<string, Promise<unknown>>();
  constructor(readonly root = defaultStoreRoot()) {}
  lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn); const tail = run.catch(() => undefined); this.chains.set(key, tail);
    void tail.then(() => { if (this.chains.get(key) === tail) this.chains.delete(key); });
    return run;
  }
  projectDir(id: string) { return path.join(this.root, "projects", id); }
  async init() { await Promise.all(["projects", "cache/models"].map(p => mkdir(path.join(this.root, p), { recursive: true }))); try { await readFile(path.join(this.root,"settings.json"),"utf8"); } catch { await atomicJson(path.join(this.root,"settings.json"),{}); } }
  async listProjects(): Promise<Project[]> {
    const dirs = await readdir(path.join(this.root, "projects"), { withFileTypes: true }).catch(() => []);
    const found: Project[] = [];
    for (const d of dirs) if (d.isDirectory()) { try { const p = Project.parse(JSON.parse(await readFile(path.join(this.projectDir(d.name), "project.json"), "utf8"))); if (p.id === d.name) found.push(p); } catch { /* 손상된 프로젝트는 목록에서 제외 */ } }
    return found.sort((a,b) => b.savedAt.localeCompare(a.savedAt));
  }
  async getProject(id: string) { try { return Project.parse(JSON.parse(await readFile(path.join(this.projectDir(id), "project.json"), "utf8"))); } catch { return null; } }
  async saveProject(project: Project) {
    const parsed = Project.parse(project);
    await this.lock(`project:${parsed.id}`, async () => { await this.ensureProject(parsed.id); await atomicJson(path.join(this.projectDir(parsed.id), "project.json"), parsed); });
    return parsed;
  }
  async createProject(name: string) {
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const project = Project.parse({ id, name, inputs: [{ id: "placeholder", kind: "photo", file: "pending" }], timeline: { video: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } }, savedAt: new Date().toISOString() });
    await this.ensureProject(id); await atomicJson(path.join(this.projectDir(id), "project.json"), project); return project;
  }
  async ensureProject(id: string) { await Promise.all(["input", "voice", "stems", "transcripts"].map(p => mkdir(path.join(this.projectDir(id), p), { recursive: true }))); }
  async settings() { try { return JSON.parse(await readFile(path.join(this.root, "settings.json"), "utf8")) as Record<string, unknown>; } catch { return {}; } }
  async saveSettings(value: Record<string, unknown>) { await atomicJson(path.join(this.root, "settings.json"), value); }
}
