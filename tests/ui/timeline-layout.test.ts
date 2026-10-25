import { describe, expect, it } from "vitest";
import { TIMELINE_ACTION_INSET, TIMELINE_RULER_HEIGHT, TRACK_ROW_HEIGHT, timelineActionHeight, timelineEditorHeight } from "../../src/ui/studio/timeline-layout";

describe("studio timeline layout", () => {
  it("uses compact rows and keeps the editor height aligned with the label ruler", () => {
    expect(TRACK_ROW_HEIGHT).toBe(28);
    expect(TIMELINE_RULER_HEIGHT).toBe(42);
    expect(timelineEditorHeight(7)).toBe(TIMELINE_RULER_HEIGHT + 7 * TRACK_ROW_HEIGHT);
  });

  it("leaves the same small inset above and below each clip bar", () => {
    expect(TIMELINE_ACTION_INSET).toBe(2);
    expect(timelineActionHeight()).toBe(TRACK_ROW_HEIGHT - TIMELINE_ACTION_INSET * 2);
  });
});
