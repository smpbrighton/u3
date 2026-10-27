import { describe, expect, it } from "vitest";
import { BrandSettings, DEFAULT_BRAND_SETTINGS, TimelineBrand } from "../../src/core/schema";
import { timelineToRender } from "../../src/core/timeline/to-render";

const emptyTimeline = () => ({ video: [], overlays: [], captions: [], voice: [], sfx: [], audio: { source: { gain: 1, muted: false }, voice: { gain: 1, muted: false }, sfx: { gain: 1, muted: false } } });
const defaults = (value: Record<string, unknown> = {}) => ({ ...DEFAULT_BRAND_SETTINGS, titleBar: { ...DEFAULT_BRAND_SETTINGS.titleBar, ...value } });
describe("타이틀 바 내용", () => {
  it("옛 설정과 프로젝트는 기본 글 종류와 빈 기본 글을 읽는다", () => {
    const { kind, text, ...old } = DEFAULT_BRAND_SETTINGS.titleBar;
    expect(BrandSettings.parse({ titleBar: old }).titleBar).toMatchObject({ kind: "text", text: "" });
    expect(TimelineBrand.parse({ titleBar: {} })).toEqual({ titleBar: {} });
  });
  it("30자 제한과 전용 이미지 파일 이름을 검증한다", () => {
    expect(BrandSettings.safeParse(defaults({ text: "가".repeat(30), file: "title.webp" })).success).toBe(true);
    for (const value of [{text:"가".repeat(31)}, {file:"../title.png"}, {file:"watermark.png"}, {kind:"video"}]) {
      expect(BrandSettings.safeParse(defaults(value)).success).toBe(false);
    }
  });
  it("영상에 글이 없거나 비어 있으면 설정 기본 글을 쓴다", () => {
    const brand = defaults({ text: "기본 글" });
    for (const titleBar of [undefined, {}, {text:""}]) {
      expect(timelineToRender({ ...emptyTimeline(), brand: {titleBar} }, brand).titleBar).toMatchObject({kind:"text",text:"기본 글",visible:true});
    }
    expect(timelineToRender({...emptyTimeline(),brand:{titleBar:{text:"영상 글",height:200,fontSize:40,opacity:.5}}},brand).titleBar).toMatchObject({text:"영상 글",height:200,fontSize:40,opacity:.5});
  });
  it("종류는 영상 값과 설정 순으로 해석하고 이미지 파일은 설정 한 장을 쓴다", () => {
    const brand = defaults({kind:"image",text:"기본 글",file:"title.png"});
    expect(timelineToRender(emptyTimeline(),brand).titleBar).toMatchObject({kind:"image",file:"title.png",visible:true});
    expect(timelineToRender({...emptyTimeline(),brand:{titleBar:{kind:"text"}}},brand).titleBar).toMatchObject({kind:"text",text:"기본 글",visible:true});
    expect(timelineToRender({...emptyTimeline(),brand:{titleBar:{kind:"image"}}},defaults({text:"글만 있음"})).titleBar?.visible).toBe(false);
  });
  it("보임 값은 enabled가 있으면 그 값을 쓰고 없으면 해당 종류의 내용을 검사한다", () => {
    const brand = defaults({text:"기본 글",file:"title.png"});
    for (const kind of ["text","image"] as const) {
      expect(timelineToRender({...emptyTimeline(),brand:{titleBar:{kind,enabled:false}}},brand).titleBar?.visible).toBe(false);
      expect(timelineToRender({...emptyTimeline(),brand:{titleBar:{kind,enabled:true}}},defaults()).titleBar?.visible).toBe(true);
    }
    expect(timelineToRender(emptyTimeline(),defaults()).titleBar?.visible).toBe(false);
  });
});
