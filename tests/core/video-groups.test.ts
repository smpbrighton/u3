import { describe, expect, it } from "vitest";
import type { Input, Timeline } from "../../src/core/schema";
import { deleteVideoSelection } from "../../src/core/timeline/ops";
import { canGroupVideoClips, deleteVideoGroup, groupVideoClips, moveVideoGroup, selectVideoRange, ungroupVideoClips } from "../../src/core/timeline/video-groups";

const empty = (): Timeline => ({ video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const timeline: Timeline = {
  ...empty(),
  video: [
    { id: "a", kind: "main", inputId: "in", inStartSec: 0, inEndSec: 2 },
    { id: "b", kind: "main", inputId: "photo", durationSec: 1 },
    { id: "c", kind: "meme", memeId: "m", durationSec: 8 },
  ],
  overlays: [[
    { id: "x", kind: "video", inputId: "in", startSec: 1, inStartSec: 3, inEndSec: 5, x: 0.5, y: 0.5, width: 0.6 },
    { id: "y", kind: "photo", inputId: "photo", startSec: 4, durationSec: 2, x: 0.4, y: 0.6, width: 0.5 },
  ]],
};
const refs = (...ids: string[]) => ids.map((id) => ({ id, track: "video" }));
const inputs: Input[] = [
  { id: "in", kind: "video", file: "input.mov", durationSec: 8 },
  { id: "photo", kind: "photo", file: "photo.jpg" },
];

describe("영상 클립 묶기", () => {
  it("같은 트랙에서 앞 클립과 뒤 클립을 Shift 선택하면 사이 클립도 선택한다", () => {
    expect(selectVideoRange(timeline, "video", "a", "c")).toEqual(refs("a", "b", "c"));
    expect(selectVideoRange(timeline, "video-2", "x", "y")).toEqual([
      { id: "x", track: "video-2" }, { id: "y", track: "video-2" },
    ]);
  });

  it("같은 트랙의 이웃 클립만 묶을 수 있고 트랙이 다르거나 이웃하지 않으면 이유를 돌려준다", () => {
    expect(canGroupVideoClips(timeline, refs("a", "b")).ok).toBe(true);
    expect(canGroupVideoClips(timeline, refs("a", "c")).reason).toBe("이웃하지 않은 클립은 묶을 수 없습니다.");
    expect(canGroupVideoClips(timeline, [...refs("a"), { id: "x", track: "video-2" }]).reason).toBe("같은 영상 트랙의 클립만 묶을 수 있습니다.");
  });

  it("그룹 id를 저장하고 선택·해제할 때 그룹 전체를 다룬다", () => {
    const grouped = groupVideoClips(timeline, refs("a", "b"), "g1");
    expect(grouped.video.slice(0, 2).map((clip) => clip.groupId)).toEqual(["g1", "g1"]);
    expect(ungroupVideoClips(grouped, ["a"])).toEqual(timeline);
  });

  it("그룹을 영상 1에서 영상 2로 함께 옮기고 각 클립의 원본 종류와 그룹 id를 유지한다", () => {
    const grouped = groupVideoClips(timeline, refs("a", "b"), "g1");
    const moved = moveVideoGroup(grouped, "g1", { track: "video-3", startSec: 3 }, inputs);
    expect(moved.video.map((clip) => clip.id)).toEqual(["c"]);
    expect(moved.overlays[1]?.map((clip) => [clip.id, clip.groupId, clip.startSec])).toEqual([["a", "g1", 0], ["b", "g1", 2]]);
    expect(moved.overlays[1]?.[0]).toMatchObject({ kind: "video", inputId: "in", inStartSec: 0, inEndSec: 2 });
    expect(moved.overlays[1]?.[1]).toMatchObject({ inputId: "photo", durationSec: 1 });
  });

  it("오버레이 그룹을 옮길 때 모든 그룹 멤버의 시작 시각을 같은 만큼 바꾼다", () => {
    const grouped = groupVideoClips(timeline, [{ id: "x", track: "video-2" }, { id: "y", track: "video-2" }], "g2");
    const moved = moveVideoGroup(grouped, "g2", { track: "video-2", startSec: 5 }, inputs);
    expect(moved.overlays[0]?.map((clip) => clip.startSec)).toEqual([5, 8]);
  });

  it("그룹 하나를 지우면 모든 그룹 멤버가 사라진다", () => {
    const grouped = groupVideoClips(timeline, refs("a", "b"), "g1");
    expect(deleteVideoGroup(grouped, "g1").video.map((clip) => clip.id)).toEqual(["c"]);
  });

  it("영상 1의 마지막 클립 삭제를 막고 이유를 돌려준다", () => {
    const last = { ...timeline, video: [timeline.video[0]!] };
    expect(deleteVideoSelection(last, ["a"])).toEqual({ timeline: last, blocked: true });
  });

  it("묶음이 영상 1 클립 전체를 포함하면 묶음과 오버레이를 모두 보존한다", () => {
    const grouped = {
      ...timeline,
      video: timeline.video.slice(0, 2).map((clip) => ({ ...clip, groupId: "all-video-1" })),
      overlays: [[{ ...timeline.overlays[0]![0]!, groupId: "all-video-1" }]],
    };
    expect(deleteVideoSelection(grouped, ["a"])).toEqual({ timeline: grouped, blocked: true });
  });

  it("영상 2 선택을 섞어도 영상 1의 마지막 클립이 남으면 선택 항목을 지운다", () => {
    const mixed = deleteVideoSelection(timeline, ["a", "x"]);
    expect(mixed.blocked).toBe(false);
    expect(mixed.timeline.video.map((clip) => clip.id)).toEqual(["b", "c"]);
    expect(mixed.timeline.overlays).toEqual([[timeline.overlays[0]![1]]]);
  });
});
