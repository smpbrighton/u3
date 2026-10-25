// Sidecar 라이브러리 인덱스. uUu의 listMemes처럼 JSON 메타와 실제 파일을 함께 확인한다.
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MemeMeta } from "../../core/schema";

export type LibraryEntry = {
  id: string;
  file: string;
  title?: string;
  category?: string;
  emotion: string;
  description?: string;
  importedAt: string;
  tagsConfirmed: boolean;
  situations: string[];
  source?: string;
  license?: string;
  durationSec?: number;
};

const memeCache = new Map<string, Promise<LibraryEntry[]>>();

function libraryBase(root: string): string {
  return path.basename(root) === "library" ? root : path.join(root, "library");
}

async function mediaFiles(root: string, subdirectory: string): Promise<LibraryEntry[]> {
  const directory = path.join(root, subdirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const output: LibraryEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...await mediaFiles(root, path.join(subdirectory, entry.name)));
      continue;
    }
    if (!/\.(mp4|mov|webm|wav|mp3|m4a|aac)$/i.test(entry.name)) continue;
    const title = path.basename(entry.name, path.extname(entry.name));
    const category = path.basename(path.dirname(fullPath));
    output.push({
      id: path.relative(directory, fullPath).replace(/\.[^.]+$/, ""),
      file: fullPath,
      title,
      category,
      emotion: category,
      importedAt: "",
      tagsConfirmed: false,
      situations: [],
    });
  }
  return output;
}

async function readMemes(root: string): Promise<LibraryEntry[]> {
  const directory = path.join(libraryBase(root), "memes");
  const folders = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const memes: LibraryEntry[] = [];
  for (const folder of folders) {
    if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
    const folderPath = path.join(directory, folder.name);
    const files = await readdir(folderPath).catch(() => []);
    for (const name of files) {
      if (!name.endsWith(".json")) continue;
      try {
        const parsed = MemeMeta.safeParse(JSON.parse(await readFile(path.join(folderPath, name), "utf8")));
        if (!parsed.success) continue;
        const meta = parsed.data;
        const mediaFile = path.join(folderPath, `${meta.id}.mp4`);
        try {
          await access(mediaFile);
        } catch {
          continue;
        }
        memes.push({
          ...meta,
          file: mediaFile,
          title: meta.description ?? meta.id,
          category: meta.emotion,
        });
      } catch {
        // 잘못된 사이드카는 건너뛴다.
      }
    }
  }
  return memes.sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id));
}

export async function listMemes(root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources")): Promise<LibraryEntry[]> {
  const key = path.resolve(root);
  let result = memeCache.get(key);
  if (!result) {
    result = readMemes(root);
    memeCache.set(key, result);
    void result.catch(() => {
      if (memeCache.get(key) === result) memeCache.delete(key);
    });
  }
  return result;
}

export function invalidateMemeCache(root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources")): void {
  memeCache.delete(path.resolve(root));
}

export async function listSfx(root = process.env.U3_LIBRARY_DIR ?? path.join(process.cwd(), "resources")): Promise<LibraryEntry[]> {
  const library = libraryBase(root);
  const items = await mediaFiles(library, "sfx");
  const output: LibraryEntry[] = [];
  for (const item of items) {
    const metadata = `${item.file.slice(0, item.file.lastIndexOf("."))}.json`;
    try {
      const raw: unknown = JSON.parse(await readFile(metadata, "utf8"));
      if (raw && typeof raw === "object") {
        const value = raw as Record<string, unknown>;
        output.push({
          ...item,
          title: typeof value.title === "string" ? value.title : item.title,
          category: typeof value.category === "string" ? value.category : item.category,
          source: typeof value.source === "string" ? value.source : undefined,
          license: typeof value.license === "string" ? value.license : undefined,
          durationSec: typeof value.durationSec === "number" ? value.durationSec : undefined,
        });
        continue;
      }
    } catch {
      // 일부 효과음에는 메타데이터가 없을 수 있다.
    }
    output.push(item);
  }
  return output;
}

export function searchLibrary(items: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const term = query.toLocaleLowerCase();
  return items.filter(item => [item.id, item.title, item.category, item.emotion, item.description]
    .some(value => value?.toLocaleLowerCase().includes(term)));
}
