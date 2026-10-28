import { describe, expect, it } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers } from "../../src/core/schema";
import { addCaptionClip, setCaptionRange, splitCaptionClip } from "../../src/core/timeline/ops";

function timeline() {
  const base = Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", durationSec: 10 }], captions: [
    { id: "prev", startSec: 0, endSec: 2, text: "앞" },
    { id: "scene-0-caption", startSec: 3, endSec: 4, text: "가운데", style: { color: "#123456", sizeScale: 1.5 } },
    { id: "next", startSec: 6, endSec: 8, text: "뒤" },
  ], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
  return withCaptionLayers(base, [{ ...captionLayersOf(base)[0]!, sub: [{ id: "sub", startSec: 3, endSec: 4, text: "서브" }] }]);
}

describe("자막 구간 편집", () => {
  it("같은 레이어·줄의 이웃까지만 늘리고 영상 경계에서 멈춘다", () => {
    const base = timeline();
    const changed = setCaptionRange(base, "scene-0-caption", -3, 20);
    expect(changed.captions[1]).toMatchObject({ startSec: 2, endSec: 6 });
    expect(base.captions[1]).toMatchObject({ startSec: 3, endSec: 4 });
    expect(setCaptionRange(base, "sub", -2, 20).captionLayers?.[0]?.sub[0]).toMatchObject({ startSec: 0, endSec: 10 });
    const tiny = setCaptionRange(base, "scene-0-caption", 5, 5).captions[1]!;
    expect(tiny.endSec - tiny.startSec).toBeCloseTo(0.1);
    expect(() => setCaptionRange(base, "missing", 0, 1)).toThrow();
    expect(() => setCaptionRange(base, "sub", NaN, 1)).toThrow();
  });

  it("나눈 뒤 조각은 장면 번호를 잃고 두 조각은 스타일을 유지한다", () => {
    const base = timeline();
    const changed = splitCaptionClip(base, "scene-0-caption", 3.5);
    const [left, right] = changed.captions.slice(1, 3);
    expect(left).toMatchObject({ startSec: 3, endSec: 3.5, sceneIndex: 0, style: base.captions[1]!.style });
    expect(right).toMatchObject({ startSec: 3.5, endSec: 4, style: base.captions[1]!.style });
    expect(right).not.toHaveProperty("sceneIndex");
    expect(Timeline.parse(changed).captions[2]).not.toHaveProperty("sceneIndex");
    expect(splitCaptionClip(base, "sub", 3.5, ["left", "right"]).captionLayers?.[0]?.sub.map(c => c.id)).toEqual(["left", "right"]);
    expect(() => splitCaptionClip(base, "sub", 3)).toThrow();
    expect(() => splitCaptionClip(base, "sub", 4)).toThrow();
  });

  it("새 자막 길이는 3초·다음 자막·영상 끝으로 제한하고 0.3초 미만은 거부한다", () => {
    const base = timeline();
    const id = captionLayersOf(base)[0]!.id;
    const added = addCaptionClip(base, id, "sub", 4)!;
    expect(added.captionLayers?.[0]?.sub.find(c => c.id !== "sub")).toMatchObject({ startSec: 4, endSec: 7, text: "" });
    expect(addCaptionClip(base, id, "main", 4)!.captions.find(c => !base.captions.some(b => b.id === c.id))).toMatchObject({ startSec: 4, endSec: 6 });
    expect(addCaptionClip(base, id, "main", 9)!.captions.at(-1)).toMatchObject({ startSec: 9, endSec: 10 });
    expect(addCaptionClip(base, id, "main", 4, 1)!.captions.find(c => c.startSec === 4)).toMatchObject({ endSec: 5 });
    expect(addCaptionClip(base, id, "main", 5.8)).toBeNull();
    expect(addCaptionClip(base, id, "main", 3.2)).toBeNull();
    expect(addCaptionClip(base, id, "main", 10)).toBeNull();
    expect(addCaptionClip(base, id, "main", -1)).toBeNull();
  });
});
