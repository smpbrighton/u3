import { describe, expect, it } from "vitest";
import { AudioClip, type Timeline } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";
import { normalizeSfxLanes, nextSfxLane } from "../../src/core/timeline/sfx-lanes";
import { decideNewLaneDrop } from "../../src/ui/studio/library-drop";

const sfx = (id: string, lane?: number) => ({ id, file: `${id}.wav`, startSec: 0, inStartSec: 0, inEndSec: 1, gain: 1, ...(lane === undefined ? {} : { lane }) });

describe("새 영상·효과음 트랙 드롭", () => {
  it("짤은 포인터 시각의 새 영상 트랙에 놓고 영상 끝 안으로 당긴다", () => {
    expect(decideNewLaneDrop({ kind: "meme", atSec: 9, videoDurationSec: 10, mediaDurationSec: 2, trackCount: 3 })).toEqual({ track: 3, startSec: 8, durationSec: 2 });
    expect(decideNewLaneDrop({ kind: "meme", atSec: 5, videoDurationSec: 1, mediaDurationSec: 2, trackCount: 1 })).toEqual({ track: 1, startSec: 0, durationSec: 1 });
  });
  it("효과음은 포인터 시각의 새 lane에 놓고 영상 끝 뒤에서는 마지막 시각으로 당긴다", () => {
    expect(decideNewLaneDrop({ kind: "sfx", atSec: 20, videoDurationSec: 10, mediaDurationSec: 2, trackCount: 2 })).toEqual({ track: 2, startSec: 8, durationSec: 2 });
    expect(decideNewLaneDrop({ kind: "sfx", atSec: 1, videoDurationSec: 10, mediaDurationSec: 2, trackCount: 2 })).toEqual({ track: 2, startSec: 1, durationSec: 2 });
  });
  it("예전 효과음 데이터는 lane 0으로 읽고 새 lane 번호와 빈 lane 정리를 계산한다", () => {
    expect(AudioClip.parse(sfx("old")).lane).toBe(0);
    expect(nextSfxLane([sfx("a", 0), sfx("b", 1)])).toBe(2);
    expect(normalizeSfxLanes([sfx("a", 0), sfx("c", 2)]).map((clip) => clip.lane)).toEqual([0, 1]);
  });
  it("모든 효과음 lane을 같은 sfx 출력으로 렌더한다", () => {
    const timeline: Timeline = { video: [{ id: "v", kind: "main", inputId: "in", durationSec: 4 }], overlays: [], captions: [], voice: [], sfx: [sfx("a", 0), sfx("b", 1)], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } };
    expect(timelineToRender(timeline).audio.filter((clip) => clip.track === "sfx")).toHaveLength(2);
  });
});
