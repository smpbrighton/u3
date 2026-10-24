import { describe, expect, it } from "vitest";
import { frameAllocation, frameCountForInputs } from "../../src/engine/pipeline/frames";

describe("frame allocation", () => {
  it("allocates one frame to each photo and ten to each video until the limit", () => {
    expect(frameCountForInputs(3)).toBe(30);
    expect(frameAllocation(3, 3)).toEqual([10, 10, 10]);
    expect(frameAllocation(5, 0)).toEqual([8, 8, 8, 8, 8]);
  });

  it("reduces video frames evenly and keeps at least three frames per video", () => {
    expect(frameAllocation(2, 34)).toEqual([3, 3]);
    expect(frameAllocation(4, 8)).toEqual([8, 8, 8, 8]);
  });

  it("rejects photo and video counts that exceed forty after minimum video frames", () => {
    expect(() => frameAllocation(7, 20)).toThrow(/40장/);
    expect(() => frameAllocation(0, 41)).toThrow(/40장/);
  });
});
