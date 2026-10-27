import { describe, expect, it } from "vitest";
import { CodexScript } from "../../src/core/schema";
import { swapCaptionRows } from "../../src/core/caption-layers";
import { timelineFromScript } from "../../src/core/timeline/from-script";
import { reviewScriptResult } from "../../src/core/script-review";

describe("W38 caption layers", () => {
  it("swaps all main and sub clips without changing their times", () => {
    const layer = { id: "l", name: "자막", x: 0.5, y: 0.7, style: { font: "pretendard" as const, mainSize: 56, subSize: 40, color: "#fff", textOpacity: 1, bar: true, barColor: "#000", barOpacity: 0.62 }, main: [{ id: "m", startSec: 1, endSec: 2, text: "한글" }], sub: [{ id: "s", startSec: 3, endSec: 4, text: "English" }] };
    expect(swapCaptionRows(layer)).toMatchObject({ main: layer.sub, sub: layer.main });
  });

  it("creates sub captions at the same times as main captions without automatically filling title", () => {
    const script = CodexScript.parse({ title: "새 제목", scenes: [{ inputIndex: 1, startSec: 0, endSec: 2, caption: "한글", subCaption: "English", reaction: "none", sfxCategory: null }] });
    const timeline = timelineFromScript(script, [{ id: "i", kind: "video", file: "x.mp4", durationSec: 2 }]);
    expect(timeline.captionLayers?.[0]?.sub).toMatchObject([{ startSec: 0, endSec: 2, text: "English" }]);
    expect(timeline.brand?.titleBar?.text).toBeUndefined();
  });

  it("accepts review changes to subCaption and title", () => {
    const draft = { title: "제목", scenes: [{ inputIndex: 1, startSec: 0, endSec: 2, caption: "한글", subCaption: "English", reaction: "none", sfxCategory: null }] };
    const reviewed = { ...draft, title: "검수 제목", scenes: [{ ...draft.scenes[0], subCaption: "Reviewed English" }] };
    expect(reviewScriptResult(draft, reviewed)).toMatchObject({ warning: null, script: { title: "검수 제목", scenes: [{ subCaption: "Reviewed English" }] } });
  });
});
