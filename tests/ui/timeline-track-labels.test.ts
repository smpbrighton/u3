import { describe, expect, it } from "vitest";
import { timelineTrackLabels, withNewVideoTrackRow } from "../../src/ui/studio/timeline-track-labels";

describe("timeline track labels", () => {
  it("adapter 행과 같은 순서와 개수로 자막 레이어 이름을 만든다", () => {
    const rows = [
      { id: "caption-main", name: "자막 메인" },
      { id: "caption-sub", name: "자막 서브" },
      { id: "pov-main", name: "POV 메인" },
      { id: "pov-sub", name: "POV 서브" },
      { id: "video-2", name: "영상 2" },
      { id: "video", name: "영상 1" },
      { id: "source", name: "원본 소리" },
      { id: "voice", name: "음성" },
      { id: "sfx", name: "효과음" },
    ];

    const labels = timelineTrackLabels(rows);

    expect(labels.map(({ id, name }) => [id, name])).toEqual(rows.map(({ id, name }) => [id, name]));
  });

  it("이름이 있는 새 영상 행도 그대로 표시한다", () => {
    const labels = timelineTrackLabels([
      { id: "captions", name: "자막" },
      { id: "video-new", name: "새 영상 트랙" },
      { id: "video", name: "영상 1" },
    ]);

    expect(labels.map(({ name }) => name)).toEqual(["자막", "새 영상 트랙", "영상 1"]);
  });

  it("새 영상 트랙 행을 자막 레이어의 메인·서브 행 아래에 둔다", () => {
    const rows = [
      { id: "caption-main", name: "자막 메인", actions: [], rowHeight: 28 },
      { id: "caption-sub", name: "자막 서브", actions: [], rowHeight: 28 },
      { id: "pov-main", name: "POV 메인", actions: [], rowHeight: 28 },
      { id: "pov-sub", name: "POV 서브", actions: [], rowHeight: 28 },
      { id: "video-2", name: "영상 2", actions: [], rowHeight: 28 },
      { id: "video", name: "영상 1", actions: [], rowHeight: 28 },
    ];

    expect(withNewVideoTrackRow(rows).map(({ id }) => id)).toEqual([
      "caption-main", "caption-sub", "pov-main", "pov-sub", "video-new", "video-2", "video",
    ]);
  });
});
