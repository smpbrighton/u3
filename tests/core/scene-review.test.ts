import { describe, expect, it } from "vitest";
import { Timeline, captionLayersOf, withCaptionLayers, type CodexScript, type MemeMeta, type SfxMeta } from "../../src/core/schema";
import { memeClipPlacement, timelineFromScript } from "../../src/core/timeline/from-script";
import { createHistory, pushHistory, undo } from "../../src/core/timeline/history";
import { insertSceneMeme, insertSceneSfx, removeSceneMeme, removeSceneSfx, replaceSceneMeme, replaceSceneSfx, sceneClips, usedMemeIds } from "../../src/core/timeline/scene-review";

const meme: MemeMeta = { id: "first", emotion: "laugh", situations: [], importedAt: "", tagsConfirmed: true, durationSec: 5 };
const sfx: SfxMeta = { id: "s", category: "laugh", file: "s.wav", title: "소리", source: "local", license: "MIT", durationSec: 3 };
const script: CodexScript = { scenes: [
  { caption: "첫 장면", subCaption: "first", inputIndex: 1, startSec: 20, endSec: 25, reaction: "laugh", memeBefore: true, memeAfter: true, sfxCategory: "laugh" },
  { caption: "둘째 장면", inputIndex: 1, startSec: 25, endSec: 30, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null },
] };
const timeline = () => timelineFromScript(script, [{ id: "v", kind: "video", file: "v.mp4", durationSec: 30 }], { memes: { 0: meme }, alternateMemes: { 0: { ...meme, id: "second" } }, sfx: { 0: sfx } });

describe("장면별 클립과 편집", () => {
  it("자동 메인·서브·앞뒤 짤·효과음에 장면 번호를 적고 이전 저장본을 복원한다", () => {
    const base = timeline();
    expect(base.captions.map(c => c.sceneIndex)).toEqual([0, 1]);
    expect(captionLayersOf(base)[0]?.sub[0]?.sceneIndex).toBe(0);
    expect(base.overlays.flat().map(c => c.sceneIndex)).toEqual([0, 0]);
    expect(base.sfx[0]?.sceneIndex).toBe(0);
    const legacy = JSON.parse(JSON.stringify(base));
    for (const c of [...legacy.captionLayers[0].main, ...legacy.captionLayers[0].sub, ...legacy.overlays.flat(), ...legacy.sfx]) delete c.sceneIndex;
    expect(sceneClips(Timeline.parse(legacy), script)[0]).toMatchObject({ index: 0, sec: 0, memes: [{ position: "before" }, { position: "after" }] });
  });

  it("시각은 자막부터 구하고 삭제된 클립은 빈 목록이며 모두 없으면 null이다", () => {
    const base = timeline();
    expect(sceneClips(base, script)[0]?.captions).toHaveLength(2);
    const removed = withCaptionLayers(base, captionLayersOf(base).map(l => ({ ...l, main: [], sub: [] })));
    expect(sceneClips(removed, script).map(r => r.sec)).toEqual([0, null]);
    expect(sceneClips({ ...removed, overlays: [], sfx: [] }, script)).toEqual([
      { index: 0, sec: null, captions: [], memes: [], sfx: [] }, { index: 1, sec: null, captions: [], memes: [], sfx: [] },
    ]);
    const moved = withCaptionLayers(base, captionLayersOf(base).map(l => ({ ...l, main: l.main.map(c => ({ ...c, startSec: c.startSec + 1 })), sub: [] })));
    expect(sceneClips(moved, script)[0]?.sec).toBe(1);
  });

  it("뒤 짤 끝과 앞 짤 시작을 장면에 맞추고 2초 상한·위치·크기·투명도를 유지한다", () => {
    const base = timeline();
    base.overlays[0]![1] = { ...base.overlays[0]![1]!, x: 0.2, y: 0.3, width: 0.4, opacity: 0.7 };
    const after = replaceSceneMeme(base, script, 0, "scene-0-meme-after", { ...meme, id: "new", durationSec: 0.5 });
    expect(after.overlays.flat().find(c => c.id === "scene-0-meme-after")).toMatchObject({ memeId: "new", startSec: 4.5, durationSec: 0.5, x: 0.2, y: 0.3, width: 0.4, opacity: 0.7 });
    expect(replaceSceneMeme(after, script, 0, "scene-0-meme-after", { ...meme, id: "new" }).overlays.flat().find(c => c.id === "scene-0-meme-after")).toMatchObject({ startSec: 3, durationSec: 2 });
    expect(replaceSceneMeme(base, script, 0, "scene-0-meme-before", { ...meme, id: "new" }).overlays.flat()[0]).toMatchObject({ startSec: 0, durationSec: 2 });
    expect(memeClipPlacement({ sceneStart: 2, sceneDuration: 0.5, memeDuration: 6, position: "after" })).toEqual({ startSec: 2, durationSec: 0.5 });
    expect(base.overlays.flat().find(c => c.id === "scene-0-meme-after")).toMatchObject({ memeId: "second", startSec: 3 });
  });

  it("자막이 없으면 짤·효과음 시작과 장면 글 길이로 구간을 구한다", () => {
    const base = timeline();
    const bare = withCaptionLayers(base, captionLayersOf(base).map(l => ({ ...l, main: [], sub: [] })));
    const changed = replaceSceneMeme(bare, script, 0, "scene-0-meme-after", { ...meme, id: "new" });
    expect(changed.overlays.flat().find(c => c.id === "scene-0-meme-after")).toMatchObject({ startSec: 0, durationSec: 1.5 });
  });

  it("다른 클립의 짤 id를 제외하고 넣기는 겹치지 않는 가장 아래 트랙을 쓴다", () => {
    const base = timeline();
    expect([...usedMemeIds(base, "scene-0-meme-after")]).toEqual(["first"]);
    const changed = insertSceneMeme(base, script, 1, { ...meme, id: "third" });
    expect(changed.overlays).toHaveLength(1);
    expect(changed.overlays[0]?.at(-1)).toMatchObject({ id: "scene-1-meme-after", sceneIndex: 1, startSec: 8, durationSec: 2 });
    expect(() => insertSceneMeme(base, script, 1, meme)).toThrow(/이미/);
    expect(() => replaceSceneMeme(base, script, 0, "scene-0-meme-after", meme)).toThrow(/이미/);
    const occupied = { ...base, overlays: [[...base.overlays[0]!, { id: "manual", memeId: "manual", startSec: 7, durationSec: 3, x: 0.5, y: 0.5, width: 0.6 }]] };
    expect(insertSceneMeme(occupied, script, 1, { ...meme, id: "third" }).overlays[1]?.[0]?.id).toBe("scene-1-meme-after");
  });

  it("짤을 빼고 다시 넣는 변경은 실행 취소 한 번으로 돌아온다", () => {
    const base = timeline();
    const removed = removeSceneMeme(base, 0, "scene-0-meme-after");
    expect(sceneClips(removed, script)[0]?.memes.map(m => m.position)).toEqual(["before"]);
    const next = insertSceneMeme(removed, script, 0, { ...meme, id: "new" });
    const history = pushHistory(createHistory(removed), next);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toEqual(removed);
  });

  it("효과음을 교체할 때 시작·gain을 유지하고 1.5초·파일·영상 끝으로 제한한다", () => {
    const base = timeline();
    base.sfx[0] = { ...base.sfx[0]!, gain: 0.4, inStartSec: 0.2 };
    expect(replaceSceneSfx(base, 0, "scene-0-sfx", { ...sfx, file: "new.wav" }, 10).sfx[0]).toMatchObject({ file: "new.wav", startSec: 0, inStartSec: 0, inEndSec: 1.5, gain: 0.4 });
    expect(replaceSceneSfx(base, 0, "scene-0-sfx", { ...sfx, durationSec: 0.3 }, 10).sfx[0]?.inEndSec).toBe(0.3);
    base.sfx[0]!.startSec = 9.8;
    expect(replaceSceneSfx(base, 0, "scene-0-sfx", sfx, 10).sfx[0]?.inEndSec).toBeCloseTo(0.2);
    expect(() => replaceSceneSfx(base, 1, "scene-0-sfx", sfx, 10)).toThrow();
  });

  it("분류 없는 장면에도 효과음을 넣고 끄며 시각 없는 장면에는 넣지 않는다", () => {
    const base = timeline();
    const changed = insertSceneSfx(base, script, 1, sfx, 5.4);
    expect(changed.sfx.at(-1)).toMatchObject({ id: "scene-1-sfx", startSec: 5, sceneIndex: 1, inEndSec: expect.closeTo(0.4) });
    expect(removeSceneSfx(changed, 1, "scene-1-sfx").sfx).toEqual(base.sfx);
    const empty = withCaptionLayers({ ...base, overlays: [], sfx: [] }, []);
    expect(insertSceneMeme(empty, script, 1, meme)).toBe(empty);
    expect(insertSceneSfx(empty, script, 1, sfx, 10)).toBe(empty);
  });
});
