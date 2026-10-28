import { describe, expect, it } from "vitest";
import { previewLoopFrames } from "../../src/ui/studio/preview-seek";

describe("자막 구간 반복 프레임", () => {
  it("끝 시각은 제외하고 Player의 inFrame·outFrame으로 바꾼다", () => {
    expect(previewLoopFrames({ startSec: 1, endSec: 4 }, 300, 30)).toEqual({ loop: true, inFrame: 30, outFrame: 119 });
    expect(previewLoopFrames({ startSec: 9, endSec: 15 }, 300, 30)).toEqual({ loop: true, inFrame: 270, outFrame: 299 });
    expect(previewLoopFrames(null, 300, 30)).toEqual({ loop: false });
  });
});
