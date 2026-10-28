import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("studio global input and edit toolbar", () => {
  it("sets readable foreground and placeholder colors for text controls", async () => {
    const controls = await Promise.all(["input", "textarea", "select"].map(name => readFile(`src/ui/components/ui/${name}.tsx`, "utf8")));
    for (const control of controls) expect(control).toContain("text-foreground");
    for (const control of controls.slice(0, 2)) expect(control).toContain("placeholder:text-placeholder");
    expect(controls[2]).toContain("data-[placeholder]:text-placeholder");
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
