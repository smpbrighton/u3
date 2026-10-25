import { describe, expect, it } from "vitest";
import * as sfx from "../../src/core/sfx";

describe("sfx situation fit request", () => {
  it("builds one pure Jev score question per candidate with situation state", () => {
    expect(sfx.sfxSituationFitRequest).toBeTypeOf("function");
    const result = sfx.sfxSituationFitRequest("반전이 드러날 때", [
      { id: "reveal-1", title: "짠", category: "reveal" },
      { id: "impact-1", title: "쾅", category: "impact" },
    ]);

    expect(result.request.state).toEqual({ 장면: { 상황: "반전이 드러날 때" } });
    expect(result.asked).toEqual(["reveal-1", "impact-1"]);
    expect(Object.keys(result.request.questions)).toEqual(["f0", "f1"]);
    expect(result.request.questions.f0?.type).toBe("score");
    expect(JSON.stringify(result.request.questions.f0?.instructions)).toContain("짠");
  });

  it("limits a Jev request to at most 90 effects", () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({ id: `sfx-${index}`, title: `effect-${index}`, category: "impact" }));
    const result = sfx.sfxSituationFitRequest("반전", candidates);
    expect(result.asked).toHaveLength(90);
    expect(result.unasked).toHaveLength(10);
  });
});
