import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, OVERLAP_SAMPLES, segmentRanges, separateChunks } from "../../src/engine/pipeline/separate";

describe("MRX 구간 처리", () => {
  it("10초 구간을 겹쳐 나누고 이어 붙인 출력 길이를 보존한다", async () => {
    const samples = CHUNK_SAMPLES + OVERLAP_SAMPLES / 2;
    const data = new Float32Array(samples * 2);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 100);
    const ranges = segmentRanges(samples);
    expect(ranges).toHaveLength(2);
    expect(ranges[1]!.start).toBeLessThan(ranges[0]!.end);
    const result = await separateChunks({ data, channels: 2, rate: 44_100 }, async chunk => ({
      voice: chunk.slice(),
      bg: Float32Array.from(chunk, sample => sample * 2),
    }));
    expect(result.voice).toHaveLength(data.length);
    expect(result.bg).toHaveLength(data.length);
    for (let i = 0; i < data.length; i += 12_000) expect(result.voice[i]).toBeCloseTo(data[i]!, 5);
  });

  it("취소를 다음 구간 시작 전에 처리한다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(separateChunks({ data: new Float32Array(20), channels: 2, rate: 44_100 }, async chunk => ({ voice: chunk, bg: chunk }), controller.signal)).rejects.toThrow("취소");
  });
});
