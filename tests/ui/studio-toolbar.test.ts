import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("studio global input and edit toolbar", () => {
  it("sets readable foreground and placeholder colors for text controls", async () => {
    const styles = await readFile("src/ui/components/ui/input.tsx", "utf8") + await readFile("src/ui/components/ui/textarea.tsx", "utf8");
    expect(styles).toContain("text-foreground");
    expect(styles).toContain("placeholder:text-placeholder");
  });

  it("keeps playback controls below preview and removes duplicate playback from edit toolbar", async () => {
    const studio = await readFile("src/ui/screens/Studio.tsx", "utf8");
    const toolbar = studio.split('<Toolbar className="studio-edit-toolbar"')[1]?.split("</Toolbar>")[0] ?? "";
    expect(toolbar).not.toContain("setPlaying(true)");
    expect(toolbar).not.toContain("timeLabel(playhead)");
    expect(studio).toContain('<div className="studio-playback-controls">');
    expect(studio).toContain('<StudioSlider label="재생 헤드"');
    expect(toolbar).toContain("실행 취소");
    expect(toolbar).toContain("다시 실행");
    expect(toolbar).toContain("스냅");
    expect(toolbar).toContain("확대");
  });
});
