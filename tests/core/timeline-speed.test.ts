import { describe, expect, it } from "vitest";
import { Timeline, captionLayersOf } from "../../src/core/schema";
import { addCaptionClip, clipDuration, overlayDuration, projectDuration, setAudioClipSpeed, setCaptionRange, setOverlayClipSpeed, setVideoClipSpeed, splitVideoClip, splitOverlayClip, trimAudioClip, trimVideoClip, trimOverlayClip, videoStartTimes } from "../../src/core/timeline/ops";
import { moveOverlayClipToVideo1, moveVideo1ClipToOverlay } from "../../src/core/timeline/video-track-edits";
import { sourceAtTimelineSec, sceneFrameSec } from "../../src/core/carousel-frame";
import { insertSceneMeme } from "../../src/core/timeline/scene-review";
import { timelineFromScript } from "../../src/core/timeline/from-script";
import { placeOverlayInLowestLayer } from "../../src/core/timeline/overlay-layers";
import { createHistory, pushHistory, redo, undo } from "../../src/core/timeline/history";

const base = () => Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "i", inStartSec: 2, inEndSec: 6 }, { id: "tail", kind: "main", inputId: "i", durationSec: 4 }], overlays: [[{ id: "o", kind: "video", inputId: "i", inStartSec: 2, inEndSec: 6, startSec: 1, x: 0.5, y: 0.5, width: 0.6 }]], captions: [{ id: "c", startSec: 6, endSec: 8, text: "글", sceneIndex: 0 }], voice: [{ id: "a", file: "a.wav", startSec: 9, inStartSec: 2, inEndSec: 6, gain: 1 }], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const scene = { caption: "글", inputIndex: 1, startSec: 2, endSec: 6, reaction: null, memeBefore: false, memeAfter: true, sfxCategory: null } as const;
describe("047 배속 편집", () => {
  it.each([0.5, 1, 1.25, 2])("%s배는 원본 구간을 유지하고 뒤 클립만 재배치한다", speed => {
    const before = base(); const next = setVideoClipSpeed(before, "v", speed);
    expect(clipDuration(next.video[0]!)).toBe(4 / speed);
    expect(videoStartTimes(next).tail).toBe(4 / speed);
    expect(next.video[0]).toMatchObject({ inStartSec: 2, inEndSec: 6 });
    expect(next.captions).toEqual(before.captions); expect(next.voice).toEqual(before.voice);
  });
  it("자르기·트림과 트랙 이동은 배속 전 원본 좌표를 보존한다", () => {
    const next = setVideoClipSpeed(base(), "v", 2);
    expect(splitVideoClip(next, "v", 1).video.slice(0, 2)).toMatchObject([{ inStartSec: 2, inEndSec: 4 }, { inStartSec: 4, inEndSec: 6 }]);
    expect(trimVideoClip(next, "v", "end", 1, 10).video[0]).toMatchObject({ inEndSec: 4 });
    const over = setOverlayClipSpeed(next, "o", 2);
    expect(splitOverlayClip(over, "o", 2).overlays[0]).toMatchObject([{ inEndSec: 4 }, { inStartSec: 4 }]);
    expect(trimOverlayClip(over, "o", "start", 2).overlays[0]?.[0]).toMatchObject({ inStartSec: 4 });
    const moved = moveVideo1ClipToOverlay(next, "v", [{ id: "i", kind: "video", file: "i.mp4" }]);
    expect(moved.overlays.flat().find(c => c.id === "v")).toMatchObject({ speed: 2, inStartSec: 2, inEndSec: 6 });
    const back = moveOverlayClipToVideo1(moved, "v", 1, ["a1", "a2"]);
    expect(back.video.find(c => c.id === "v")).toMatchObject({ speed: 2, inEndSec: 6 });
    const voice = setAudioClipSpeed(base(), "a", 2).voice;
    expect(trimAudioClip(voice, "a", "start", 10, 10)[0]).toMatchObject({ inStartSec: 4 });
    expect(sourceAtTimelineSec(next, 1)?.sourceSec).toBe(4);
    expect(sceneFrameSec([scene], next, 1)).toBe(1);
  });
  it("단축한 영상 끝의 자동 뒤 짤을 앞당기고 너무 긴 오버레이를 자른다", () => {
    const generated = timelineFromScript({ scenes: [scene] }, [{ id: "i", kind: "video", file: "i.mp4", durationSec: 8 }], { memes: { 0: { id: "m", emotion: "e", situations: [], importedAt: "", tagsConfirmed: true, durationSec: 2 } } });
    const next = setVideoClipSpeed(generated, generated.video[0]!.id, 2);
    expect(next.overlays[0]?.[0]).toMatchObject({ startSec: 0, durationSec: 2 });
    const long = { ...base(), video: [base().video[0]!] };
    const cropped = setVideoClipSpeed(long, "v", 2).overlays[0]![0]!;
    expect(cropped.startSec).toBe(0); expect(overlayDuration(cropped)).toBe(2);
    const slowed = setOverlayClipSpeed(base(), "o", 0.5).overlays[0]![0]!;
    expect(slowed.startSec).toBe(1); expect(overlayDuration(slowed)).toBe(7);
  });
  it("전환 조정과 배속은 실행 취소 한 번이며 0프레임 편집을 거절한다", () => {
    const before = base(); before.video[0]!.endTransition = { kind: { kind: "dissolve" }, durationSec: 2 };
    const next = setVideoClipSpeed(before, "v", 2);
    expect(next.video[0]!.endTransition?.durationSec).toBe(1);
    const tiny = { ...before, video: [{ ...before.video[0]!, inEndSec: 2.3 }] };
    expect(setVideoClipSpeed(tiny, "v", 2).video[0]!.endTransition?.kind.kind ?? "none").toBe("none");
    expect(() => splitVideoClip(next, "v", 0.001)).toThrow();
    const h = pushHistory(createHistory(before), next); expect(undo(h).present).toEqual(before); expect(redo(undo(h)).present).toEqual(next);
  });
  it("영상 뒤 자막·장면은 프로젝트 끝까지 편집하고 오버레이 충돌은 배속 길이로 판정한다", () => {
    const t = setVideoClipSpeed(base(), "v", 2); expect(projectDuration(t)).toBe(13);
    expect(setCaptionRange(t, "c", 7, 10).captions[0]).toMatchObject({ startSec: 7, endSec: 10 });
    expect(addCaptionClip(t, captionLayersOf(t)[0]!.id, "main", 9)?.captions.at(-1)?.endSec).toBe(12);
    expect(insertSceneMeme(t, { scenes: [scene] }, 0, { id: "new", emotion: "e", situations: [], importedAt: "", tagsConfirmed: true }).overlays.flat().find(c => "memeId" in c)).toMatchObject({ startSec: 6, durationSec: 2 });
    const o = { ...base().overlays[0]![0]!, speed: 2 };
    expect(placeOverlayInLowestLayer([[o]], { ...o, id: "next", startSec: 3 })).toHaveLength(1);
  });
});
