import { describe, expect, it } from "vitest";
import { releaseMemePreview } from "../../src/ui/studio/library-window";

describe("meme preview media request", () => {
  it("removes the source before calling load to abort an offscreen request", () => {
    const calls: string[] = [];
    releaseMemePreview({
      removeAttribute: (name) => calls.push(`remove:${name}`),
      load: () => calls.push("load"),
    });

    expect(calls).toEqual(["remove:src", "load"]);
  });
});
