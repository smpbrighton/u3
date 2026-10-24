// 짤 설명 임베딩(결정 0036). 로컬 bge-m3(fp32 ONNX)로 서버 안에서 만들고, 라이브러리 전체 벡터를 파일 하나로 둔다.
//   data/cache/meme-embed/bge-m3.f32  벡터(짤마다 1,024개, CLS pooling, 정규화)
//   data/cache/meme-embed/bge-m3.json { model, dim, items: [{ id, docHash }] }(벡터 순서와 같음)
// @huggingface/transformers는 여기서만, 처음 부를 때 동적으로 불러온다(서버가 켜질 때는 올리지 않는다).
// 모델 파일은 data/cache/models/에 둔다. 없으면 처음 쓸 때 Hugging Face에서 내려받는다(2.1GB).
import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { memeDoc, topBySimilarity } from "../../core/meme-rank";
import { listMemes, type LibraryEntry } from "./library";

export type MemeEmbedderStatus = "idle" | "loading" | "ready" | "error";

export interface MemeEmbedder {
  /** 색인 파일 이름과 모델 구분에 쓴다 */
  readonly model: string;
  status(): MemeEmbedderStatus;
  /** 글마다 정규화한 벡터 하나. 모델을 아직 안 올렸으면 올린다(동시에 부르면 같은 로드를 기다린다) */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

const BGE_M3 = "Xenova/bge-m3";
const BATCH = 16;

export function bgeM3Embedder(opts: { cacheDir: string }): MemeEmbedder {
  let state: MemeEmbedderStatus = "idle";
  let loading: Promise<(texts: string[]) => Promise<{ data: Float32Array }>> | null = null;

  const load = () => {
    loading ??= (async () => {
      state = "loading";
      try {
      const cachedModel = path.join(opts.cacheDir, "models--Xenova--bge-m3");
      await access(cachedModel);
        const { pipeline, env } = await import("@huggingface/transformers");
        env.cacheDir = opts.cacheDir;
      env.allowRemoteModels = false;
        // 타입이 너무 복잡해 함수 하나로 좁혀 쓴다
        const extractor = (await (pipeline as unknown as (task: string, model: string, o: object) => Promise<unknown>)("feature-extraction", BGE_M3, {
          dtype: "fp32",
          device: "cpu",
        })) as (texts: string[], o: object) => Promise<{ data: Float32Array }>;
        state = "ready";
        return (texts: string[]) => extractor(texts, { pooling: "cls", normalize: true });
      } catch (e) {
        state = "error";
        loading = null;
        throw e;
      }
    })();
    return loading;
  };

  return {
    model: "bge-m3",
    status: () => state,
    async embed(texts) {
      const run = await load();
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        const t = await run(batch);
        const dim = t.data.length / batch.length;
        for (let j = 0; j < batch.length; j++) out.push(t.data.slice(j * dim, (j + 1) * dim));
      }
      return out;
    },
  };
}

/** 테스트용 가짜 임베더. 글의 두 글자 조각을 해시 칸에 세어 정규화하므로 글자가 겹칠수록 가깝다. error를 넣으면 embed가 실패한다 */
export function fakeMemeEmbedder(opts: { dim?: number } = {}): MemeEmbedder & { calls: string[][]; error: Error | null } {
  const dim = opts.dim ?? 64;
  const calls: string[][] = [];
  const vec = (text: string): Float32Array => {
    const v = new Float32Array(dim);
    const ch = [...text.normalize("NFC").toLowerCase().replace(/\s+/g, "")];
    for (let i = 0; i + 1 < ch.length; i++) {
      const h = createHash("sha1").update(ch[i]! + ch[i + 1]!).digest();
      v[h.readUInt16BE(0) % dim]! += 1;
    }
    const norm = Math.hypot(...v);
    if (norm > 0) for (let i = 0; i < dim; i++) v[i] = v[i]! / norm;
    return v;
  };
  const self = {
    model: "fake",
    calls,
    error: null as Error | null,
    status: (): MemeEmbedderStatus => (self.error ? "error" : calls.length ? "ready" : "idle"),
    async embed(texts: readonly string[]) {
      if (self.error) throw self.error;
      calls.push([...texts]);
      return texts.map(vec);
    },
  };
  return self;
}

export const memeDocHash = (doc: string): string => createHash("sha256").update(doc).digest("hex").slice(0, 16);

export interface MemeIndexFile {
  model: string;
  dim: number;
  items: { id: string; docHash: string }[];
}

export const memeIndexFiles = (dataRoot: string, model: string) => {
  const dir = path.join(dataRoot, "cache", "meme-embed");
  return { dir, meta: path.join(dir, `${model}.json`), vectors: path.join(dir, `${model}.f32`) };
};

/** 색인 파일을 읽는다. 없거나 깨졌거나 길이가 맞지 않으면 null */
export async function readMemeIndex(dataRoot: string, model: string): Promise<{ meta: MemeIndexFile; matrix: Float32Array } | null> {
  const f = memeIndexFiles(dataRoot, model);
  try {
    const meta = JSON.parse(await readFile(f.meta, "utf8")) as MemeIndexFile;
    const buf = await readFile(f.vectors);
    if (meta.model !== model || !(meta.dim > 0) || !Array.isArray(meta.items)) return null;
    if (buf.byteLength !== meta.items.length * meta.dim * 4) return null;
    const matrix = new Float32Array(buf.byteLength / 4);
    new Uint8Array(matrix.buffer).set(buf);
    return { meta, matrix };
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/** 색인을 쓴다. 벡터를 먼저, 메타를 나중에 바꾼다(메타가 새 것이면 벡터도 새 것이다) */
export async function writeMemeIndex(dataRoot: string, meta: MemeIndexFile, matrix: Float32Array): Promise<void> {
  const f = memeIndexFiles(dataRoot, meta.model);
  await mkdir(f.dir, { recursive: true });
  await writeAtomic(f.vectors, new Uint8Array(matrix.buffer, matrix.byteOffset, matrix.byteLength));
  await writeAtomic(f.meta, JSON.stringify(meta));
}

export interface MemeIndex {
  /** 새 짤과 바뀐 문서만 임베딩하고 삭제된 짤을 색인에서 뺀다. */
  /** 임베딩 실패는 호출자에게 알린다. */
  sync(library?: readonly LibraryEntry[]): Promise<void>;
  /** sync 뒤 유사도 상위 k개(짤이 없으면 빈 배열) */
  search(text: string, k: number): Promise<{ id: string; sim: number }[]>;
  embedder: MemeEmbedder;
}

type IndexState = { ids: string[]; hashes: string[]; matrix: Float32Array; dim: number };

/** list는 라이브러리를 읽는 함수다. 서버는 캐시(memeLibraryCache)를 넘겨 검색마다 사이드카를 다시 읽지 않는다 */
export function memeIndex(dataRoot: string, embedder: MemeEmbedder, list: () => Promise<readonly LibraryEntry[]> = () => listMemes(dataRoot)): MemeIndex {
  let state: IndexState | null = null;
  let loaded = false;
  // 마지막으로 맞춘 라이브러리 배열. 캐시가 같은 배열을 돌려주면 문서 해시를 다시 세지 않는다
  let synced: readonly LibraryEntry[] | null = null;
  // 갱신은 한 번에 하나
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const doSync = async (given?: readonly LibraryEntry[]): Promise<IndexState> => {
    if (!loaded) {
      const file = await readMemeIndex(dataRoot, embedder.model);
      state = file ? { ids: file.meta.items.map((i) => i.id), hashes: file.meta.items.map((i) => i.docHash), matrix: file.matrix, dim: file.meta.dim } : null;
      loaded = true;
    }
    const library = given ?? (await list());
    if (state && library === synced) return state;
    const docs = library.map((m) => memeDoc(m));
    const hashes = docs.map(memeDocHash);
    const have = new Map<string, number>();
    state?.ids.forEach((id, i) => have.set(`${id}\0${state!.hashes[i]}`, i));
    const missing = library.map((m, i) => (have.has(`${m.id}\0${hashes[i]}`) ? -1 : i)).filter((i) => i >= 0);
    const unchanged = state && !missing.length && state.ids.length === library.length && state.ids.every((id, i) => id === library[i]!.id);
    if (unchanged) {
      synced = library;
      return state!;
    }

    const fresh = missing.length ? await embedder.embed(missing.map((i) => docs[i]!)) : [];
    const dim = fresh[0]?.length ?? state?.dim ?? 0;
    const matrix = new Float32Array(library.length * dim);
    const freshAt = new Map(missing.map((i, n) => [i, fresh[n]!]));
    library.forEach((m, i) => {
      const f = freshAt.get(i);
      if (f) matrix.set(f, i * dim);
      else {
        const at = have.get(`${m.id}\0${hashes[i]}`)!;
        matrix.set(state!.matrix.subarray(at * dim, (at + 1) * dim), i * dim);
      }
    });
    const next: IndexState = { ids: library.map((m) => m.id), hashes, matrix, dim };
    await writeMemeIndex(dataRoot, { model: embedder.model, dim, items: next.ids.map((id, i) => ({ id, docHash: hashes[i]! })) }, matrix);
    state = next;
    synced = library;
    return next;
  };

  return {
    embedder,
    sync: (library) => serial(() => doSync(library)).then(() => undefined),
    async search(text, k) {
      const s = await serial(() => doSync());
      if (!s.ids.length) return [];
      const [q] = await embedder.embed([text]);
      return topBySimilarity(q!, s.matrix, s.dim, k).map((r) => ({ id: s.ids[r.index]!, sim: r.sim }));
    },
  };
}
