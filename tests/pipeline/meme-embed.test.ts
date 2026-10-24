// 짤 임베딩 색인: 가짜 임베더로 증분 갱신·다시 읽기·검색을 확인한다(모델 파일 없이 돈다)
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memeDoc } from "../../src/core/meme-rank";
import { bgeM3Embedder, fakeMemeEmbedder, memeIndex, readMemeIndex } from "../../src/engine/pipeline/meme-embed";
import { listMemes } from "../../src/engine/pipeline/library";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uuu-embed-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const MEMES = [
  { id: "m1", emotion: "분노", description: "고양이가 이를 악물고 노려봄", situations: ["짜증"] },
  { id: "m2", emotion: "웃음", description: "아기가 크게 웃음", situations: ["기쁨"] },
  { id: "m3", emotion: "당황", description: "남자가 눈을 크게 뜨고 굳음", situations: ["깜짝"] },
];

async function addMemes(dataRoot: string, memes: readonly { id: string; emotion: string; description?: string; situations?: string[] }[]): Promise<void> {
  for (const meme of memes) {
    const folder = path.join(dataRoot, "library", "memes", meme.emotion);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, `${meme.id}.json`), JSON.stringify({
      ...meme,
      situations: meme.situations ?? [],
      importedAt: "2026-09-01T00:00:00.000Z",
      tagsConfirmed: true,
    }));
    await writeFile(path.join(folder, `${meme.id}.mp4`), "");
  }
}


describe("짤 임베딩 색인", () => {
  it("does not download bge-m3 when the local model cache is missing", async () => {
    const embedder = bgeM3Embedder({ cacheDir: path.join(dir, "models") });
    await expect(embedder.embed(["test"])).rejects.toThrow();
    expect(embedder.status()).toBe("error");
  });

  it("처음에는 전부 임베딩하고 파일로 남긴다", async () => {
    await addMemes(dir, MEMES);
    const emb = fakeMemeEmbedder();
    await memeIndex(dir, emb).sync();
    expect(emb.calls).toHaveLength(1);
    expect(emb.calls[0]).toHaveLength(3);
    const file = await readMemeIndex(dir, "fake");
    expect(file!.meta.items.map((i) => i.id).sort()).toEqual(["m1", "m2", "m3"]);
    expect(file!.matrix).toHaveLength(3 * file!.meta.dim);
  });

  it("다시 읽어도 같고, 바뀐 것이 없으면 임베딩하지 않는다", async () => {
    await addMemes(dir, MEMES);
    const first = fakeMemeEmbedder();
    await memeIndex(dir, first).sync();
    const before = await readMemeIndex(dir, "fake");

    const second = fakeMemeEmbedder();
    await memeIndex(dir, second).sync();
    expect(second.calls).toHaveLength(0);
    const after = await readMemeIndex(dir, "fake");
    expect(after!.meta).toEqual(before!.meta);
    expect(Array.from(after!.matrix)).toEqual(Array.from(before!.matrix));
  });

  it("새 짤과 문서가 바뀐 짤만 임베딩하고, 지운 짤은 뺀다", async () => {
    await addMemes(dir, MEMES);
    const emb = fakeMemeEmbedder();
    const index = memeIndex(dir, emb);
    await index.sync();
    const before = await readMemeIndex(dir, "fake");
    emb.calls.length = 0;

    // m2 설명을 고치고, m3를 지우고, m4를 더한다
    await addMemes(dir, [
      { id: "m2", emotion: "웃음", description: "아기가 배를 잡고 웃음", situations: ["기쁨"] },
      { id: "m4", emotion: "분노", description: "곰이 소리를 지름" },
    ]);
    await rm(path.join(dir, "library/memes/당황/m3.mp4"));
    await index.sync();

    expect(emb.calls).toHaveLength(1);
    expect(emb.calls[0]!.sort()).toEqual(
      [
        memeDoc({ emotion: "웃음", situations: ["기쁨"], description: "아기가 배를 잡고 웃음" }),
        memeDoc({ emotion: "분노", situations: [], description: "곰이 소리를 지름" }),
      ].sort(),
    );
    const after = await readMemeIndex(dir, "fake");
    const ids = after!.meta.items.map((i) => i.id);
    expect(ids.sort()).toEqual(["m1", "m2", "m4"]);
    // 그대로인 m1의 벡터는 그대로다
    const at = (f: NonNullable<typeof after>, id: string) => {
      const index = f.meta.items.findIndex(item => item.id === id);
      return Array.from(f.matrix.slice(index * f.meta.dim, (index + 1) * f.meta.dim));
    };
    expect(at(after!, "m1")).toEqual(at(before!, "m1"));
    expect(at(after!, "m2")).not.toEqual(at(before!, "m2"));
  });

  it("검색은 설명이 가까운 짤을 앞에 둔다", async () => {
    await addMemes(dir, MEMES);
    const index = memeIndex(dir, fakeMemeEmbedder());
    const hits = await index.search("분노: 고양이가 이를 악물고 노려봄 (짜증)", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.id).toBe("m1");
    expect(hits[0]!.sim).toBeGreaterThan(hits[1]!.sim);
  });

  it("짤이 없으면 검색 결과도 없다", async () => {
    const emb = fakeMemeEmbedder();
    expect(await memeIndex(dir, emb).search("아무 글", 5)).toEqual([]);
    expect(await listMemes(dir)).toEqual([]);
  });

  it("임베딩 실패는 던지고, 파일은 그대로다. 다음에 다시 시도한다", async () => {
    await addMemes(dir, MEMES);
    const emb = fakeMemeEmbedder();
    const index = memeIndex(dir, emb);
    emb.error = new Error("모델 없음");
    await expect(index.sync()).rejects.toThrow("모델 없음");
    expect(await readMemeIndex(dir, "fake")).toBeNull();
    emb.error = null;
    await index.sync();
    expect((await readMemeIndex(dir, "fake"))!.meta.items).toHaveLength(3);
  });

  it("깨진 색인 파일은 처음부터 다시 만든다", async () => {
    await addMemes(dir, MEMES);
    await memeIndex(dir, fakeMemeEmbedder()).sync();
    await writeFile(path.join(dir, "cache/meme-embed/fake.f32"), "x");
    const emb = fakeMemeEmbedder();
    await memeIndex(dir, emb).sync();
    expect(emb.calls[0]).toHaveLength(3);
  });

  it("동시에 부른 갱신은 한 번에 하나, 임베딩은 한 번만", async () => {
    await addMemes(dir, MEMES);
    const emb = fakeMemeEmbedder();
    const index = memeIndex(dir, emb);
    await Promise.all([index.sync(), index.sync(), index.search("아무 글", 1)]);
    // 문서 임베딩 1회 + 검색어 1회
    expect(emb.calls.map((c) => c.length).sort()).toEqual([1, 3]);
  });
});
