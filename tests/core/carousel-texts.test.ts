import { describe, expect, it } from "vitest";
import { Carousel, CarouselTextObject, defaultTexts, newSlide, textsFromLegacy } from "../../src/core/carousel";
import { scriptFrameSecs, nearestScriptFrame } from "../../src/core/carousel-frame";

const stamp = "2026-10-26T00:00:00.000Z";
describe("carousel text objects", () => {
  for (const aspect of ["4:5", "1:1", "9:16", "16:9"] as const) {
    for (const [textPlacement, y] of [["top", 0.09], ["center", 0.40], ["bottom", 0.62]] as const) {
      it(`converts ${textPlacement} at ${aspect} and serializes only texts`, () => {
        const parsed = Carousel.parse({ id: "c", name: "이름", topic: "주제", aspect, createdAt: stamp, savedAt: stamp,
          slides: [{ id: "s", title: "제목", body: "본문", textPlacement }] });
        expect(parsed.stage).toBe("images");
        expect(parsed.caption).toBe("");
        expect(parsed.slides[0]).toMatchObject({ brightness: 1, shade: 0.35 });
        const texts = parsed.slides[0]!.texts;
        expect(texts).toHaveLength(2);
        expect(texts[0]).toMatchObject({ role: "title", text: "제목", x: 0.08, y, width: 0.84, fontSize: 76, effect: "shadow" });
        expect(texts[1]).toMatchObject({ role: "body", text: "본문", fontSize: 40, x: aspect === "16:9" ? 0.2 : 0.08, width: aspect === "16:9" ? 0.6 : 0.84 });
        expect(texts[1]!.y).toBeGreaterThan(y);
        expect(JSON.parse(JSON.stringify(parsed)).slides[0]).not.toHaveProperty("title");
        expect(JSON.stringify(parsed)).not.toContain('"textPlacement"');
        expect(JSON.parse(JSON.stringify(parsed)).slides[0]).not.toHaveProperty("body");
        expect(Carousel.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      });
    }
  }
  it("validates ranges, fixed font weights, required roles and unique ids", () => {
    const text = defaultTexts("4:5")[0]!;
    for (const patch of [{ x: -1 }, { y: 2 }, { width: 2 }, { fontSize: 201 }, { opacity: -1 }, { text: "a".repeat(5001) }, { font: "gmarket", weight: 400 }, { font: "tmon", weight: 700 }]) {
      expect(CarouselTextObject.safeParse({ ...text, ...patch }).success).toBe(false);
    }
    const base = { id: "c", name: "이름", topic: "주제", aspect: "4:5", createdAt: stamp, savedAt: stamp };
    for (const texts of [[text], [text, text], defaultTexts("4:5").map(t => ({ ...t, role: "extra" }))]) {
      expect(Carousel.safeParse({ ...base, slides: [{ id: "s", texts }] }).success).toBe(false);
    }
    expect(Carousel.safeParse({ ...base, caption: "a".repeat(2001), slides: [] }).success).toBe(false);
  });
  it("initializes topic and project slides without sharing text objects", () => {
    const topic = newSlide({ kind: "topic" }, "4:5");
    expect(topic.texts.map(t => t.text)).toEqual(["", ""]);
    expect(topic.imagePrompt).toBe("");
    expect(topic.background).toEqual({ kind: "generated" });
    const previous = { ...newSlide({ kind: "project", projectId: "p", projectName: "영상" }, "4:5"), sceneNumber: 3,
      background: { kind: "frame" as const, sec: 8, cropY: 0.2, status: "done" as const, highlight: { style: "border" as const, target: "상품" } } };
    const derived = newSlide({ kind: "project", projectId: "p", projectName: "영상" }, "4:5", previous);
    expect(derived.sceneNumber).toBe(3);
    expect(derived.background).toMatchObject({ kind: "frame", sec: 8, cropY: 0.5, highlight: { style: "none", target: "" } });
    expect(derived.id).not.toBe(previous.id);
    expect(topic.texts[0]).not.toBe(derived.texts[0]);
    expect(textsFromLegacy({}, "4:5")).toEqual(defaultTexts("4:5"));
  });
});
describe("script frame times", () => {
  it("uses the centers of equal intervals and chooses the closest existing time", () => {
    expect(scriptFrameSecs(4, 8)).toEqual([1, 3, 5, 7]);
    expect(nearestScriptFrame([1, 3, 5, 7], 4.8)).toBe(5);
    expect(nearestScriptFrame([5, 1, 3], 2)).toBe(1);
    expect(nearestScriptFrame([], 2)).toBeNull();
    expect(scriptFrameSecs(0, 8)).toEqual([]);
  });
});


describe("new slide aspect", () => {
  for (const aspect of ["4:5", "1:1", "9:16", "16:9"] as const) {
    it(`initializes text geometry for ${aspect}`, () => {
      const slide = newSlide({ kind: "topic" }, aspect);
      expect(slide.texts).toEqual(defaultTexts(aspect));
      const derived = newSlide({ kind: "project", projectId: "p", projectName: "영상" }, aspect);
      expect(derived.texts).toEqual(defaultTexts(aspect));
    });
  }
});
