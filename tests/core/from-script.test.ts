import { describe, expect, it } from "vitest";
import { timelineFromScript } from "../../src/core/timeline/from-script";
import type { CodexScript, Input, MemeMeta, SfxMeta } from "../../src/core/schema";

const inputs: Input[] = [
  { id: "photo", kind: "photo", file: "p.jpg" },
  { id: "video", kind: "video", file: "v.mp4", durationSec: 12 },
];
const meme: MemeMeta = { id: "m1", emotion: "laugh", situations: [], importedAt: "now", tagsConfirmed: true, durationSec: 5 };
const sound: SfxMeta = { id: "s1", category: "laugh", file: "s.wav", title: "laugh", source: "local", license: "MIT", durationSec: 0.4 };

describe("timelineFromScript", () => {
  it("장면을 앞짤·본 화면·뒤짤 순으로 만들고 같은 시각에 자막·효과음을 둔다", () => {
    const script: CodexScript = { scenes: [
      { caption: "사진 장면", inputIndex: 1, reaction: "웃음", memeBefore: true, memeAfter: true, sfxCategory: "laugh", startSec: null, endSec: null },
      { caption: "영상 장면", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 3, endSec: 6 },
    ] };
    const timeline = timelineFromScript(script, inputs, { memes: { 0: meme }, sfx: { 0: sound } });
    expect(timeline.video.map((clip) => clip.id)).toEqual(["scene-0-meme-before", "scene-0-main", "scene-0-meme-after", "scene-1-main"]);
    const photoDuration = Math.max(1.5, [..."사진 장면"].length / 5.7);
    expect(timeline.video[1]).toMatchObject({ durationSec: photoDuration });
    expect(timeline.video[0]).toMatchObject({ durationSec: 2 });
    expect(timeline.video[2]).toMatchObject({ durationSec: 2 });
    expect(timeline.captions[0]).toMatchObject({ startSec: 0, endSec: photoDuration + 4 });
    expect(timeline.sfx[0]).toMatchObject({ startSec: 0, file: "s.wav" });
    expect(timeline.captions[1]?.startSec).toBe(photoDuration + 4);
    expect(timeline.video.at(-1)).toMatchObject({ inStartSec: 3, inEndSec: 6 });
  });
  it("사진 기본 길이는 최소 1.5초이고 영상 구간은 원본 경계에서 거부한다", () => {
    const short: CodexScript = { scenes: [{ caption: "Hi", inputIndex: 1, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: null, endSec: null }] };
    expect(timelineFromScript(short, inputs).video[0]).toMatchObject({ durationSec: 1.5 });
    const outside: CodexScript = { scenes: [{ caption: "길이 초과", inputIndex: 2, reaction: null, memeBefore: false, memeAfter: false, sfxCategory: null, startSec: 9, endSec: 13 }] };
    expect(() => timelineFromScript(outside, inputs)).toThrow(/원본 길이/u);
  });
});
