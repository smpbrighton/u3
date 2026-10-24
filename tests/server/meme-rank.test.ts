import { describe, expect, it } from "vitest";
import { answerFor, fakeJevClient } from "../../src/engine/pipeline/jev";
import { rankSceneMemes, searchMemeCandidates } from "../../src/engine/pipeline/meme-rank";
import { memoryUsageLog } from "../../src/engine/pipeline/usage";
import { fakeMemeEmbedder, memeIndex } from "../../src/engine/pipeline/meme-embed";
import type { LibraryEntry } from "../../src/engine/pipeline/library";

const memes: LibraryEntry[] = [
  { id: "laugh", file: "laugh.mp4", emotion: "laugh", description: "웃긴 장면", importedAt: "2026-01-01T00:00:00.000Z", tagsConfirmed: true, situations: ["funny"] },
  { id: "sad", file: "sad.mp4", emotion: "sad", description: "슬픈 장면", importedAt: "2026-01-02T00:00:00.000Z", tagsConfirmed: true, situations: ["sad"] },
];
const scene = { caption: "웃긴 장면", query: "funny", reaction: "laugh" };

describe("meme ranking", () => {
  it("keeps rule candidates when embeddings are unavailable", async () => {
    const result = await searchMemeCandidates({ index: null }, "laugh", scene, memes);
    expect(result.ids).toContain("laugh");
    expect(result.rule[0]!.id).toBe("laugh");
  });

  it("uses rule ordering if Jev fails and uses Jev ranking if it succeeds", async () => {
    const usage = memoryUsageLog();
    const unavailable = { ask: async () => { throw new Error("offline"); } };
    const fallback = await rankSceneMemes({ jev: unavailable, usage, index: null }, scene, memes, "project-1");
    expect(fallback.by).toBe("rule");
    expect(fallback.list[0]!.meme.id).toBe("laugh");

    const jev = fakeJevClient((_id, question) => answerFor(question, 0.95, "3"));
    const ranked = await rankSceneMemes({ jev, usage, index: null }, scene, memes, "project-1");
    expect(ranked.by).toBe("jev");
    expect(ranked.list[0]!.meme.id).toBe("laugh");
    expect(usage.entries[0]!.provider).toBe("jev");
  });

  it("keeps rule ranking as the source when embedding fails", async () => {
    const usage = memoryUsageLog();
    const embedder = fakeMemeEmbedder();
    embedder.error = new Error("bge-m3 모델 없음");
    const index = memeIndex("/tmp/u3-meme-rank-no-model", embedder, async () => memes);
    const jev = fakeJevClient((_id, question) => answerFor(question, 0.95, "3"));

    const result = await rankSceneMemes({ jev, usage, index }, scene, memes, "project-1");

    expect(result.by).toBe("rule");
    expect(result.search.embedError).toContain("모델 없음");
    expect(result.list[0]!.meme.id).toBe("laugh");
    expect(usage.entries).toHaveLength(0);
  });
});
