import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Timeline, CodexScript, MemeMeta } from "../../src/core/schema";
import { createHistory, pushHistory, undo } from "../../src/core/timeline/history";
import { SceneReview, SceneMemeChoices, sceneMemeRankRequest } from "../../src/ui/studio/SceneReview";

const controls = vi.hoisted(() => new Map<string, any>());
vi.mock("../../src/ui/components/ui/button", () => ({ Button: (p: any) => { controls.set(p["aria-label"] ?? String(p.children), p); return <button>{p.children}</button>; } }));
const script = CodexScript.parse({ scenes: [{ caption: "첫 *장면*", inputIndex: 1, startSec: 0, endSec: 5, reaction: "놀람", sfxCategory: null }] });
const timeline = Timeline.parse({ video: [{ id: "v", kind: "main", inputId: "v", durationSec: 5 }], captions: [{ id: "scene-0-caption", startSec: 0, endSec: 5, text: "첫 장면" }], overlays: [[{ id: "scene-0-meme-after", sceneIndex: 0, startSec: 3, durationSec: 2, memeId: "old", x: 0.4, y: 0.3, width: 0.6 }]] });
const candidate = { ...MemeMeta.parse({ id: "new", emotion: "놀람", situations: [], importedAt: "", tagsConfirmed: true, durationSec: 1 }), url: "/new.mp4" };
describe("장면 검토", () => {
  it("장면 줄·없음·대본 빈 상태를 표시한다", () => {
    const draw = (data: typeof timeline, source: typeof script | null) => renderToStaticMarkup(<SceneReview projectId="p" timeline={data} script={source} onChange={vi.fn()} onSeek={vi.fn()} onMore={vi.fn()} onError={vi.fn()} />);
    expect(draw(timeline, script)).toContain("첫 장면");
    const empty = draw({ ...timeline, overlays: [] }, script);
    expect(empty).toContain("짤 없음"); expect(empty).toContain("효과음 없음");
    expect(draw(timeline, null)).toContain("대본이 없어요");
  });
  it("짤 후보 요청은 별표와 이미 쓴 짤을 제외한다", () => {
    expect(sceneMemeRankRequest(timeline, script.scenes[0]!)).toMatchObject({ caption: "첫 장면", reaction: "놀람", excludeIds: ["old"] });
  });
  it("후보 교체·빼기는 한 번의 기록으로 들어가 실행 취소 한 번으로 돌아온다", () => {
    let history = createHistory(timeline); const onChange = vi.fn((next) => { history = pushHistory(history, next); });
    const draw = () => renderToStaticMarkup(<SceneMemeChoices timeline={history.present} script={script} sceneIndex={0} clipId="scene-0-meme-after" candidates={[candidate]} onChange={onChange} onClose={vi.fn()} onMore={vi.fn()} />);
    draw(); controls.get("짤 new")!.onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(history.present.overlays[0]![0]).toMatchObject({ memeId: "new", durationSec: 1, startSec: 4, x: 0.4, y: 0.3 });
    history = undo(history); expect(history.present).toEqual(timeline);
    draw(); controls.get("빼기")!.onClick();
    expect(history.present.overlays.flat()).toHaveLength(0);
    expect(undo(history).present).toEqual(timeline);
  });
});
