import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("studio global input and edit toolbar", () => {
  it("sets readable foreground and placeholder colors for text controls", async () => {
    const styles = await readFile("src/ui/styles.css", "utf8");
    expect(styles).toMatch(/input[^{}]*textarea[^{}]*select[^{}]*\{[^}]*color:\s*var\(--seed-color-fg-neutral\)/s);
    expect(styles).toMatch(/::placeholder\s*\{[^}]*color:/s);
  });

  it("keeps playback controls below preview and removes duplicate playback from edit toolbar", async () => {
    const studio = await readFile("src/ui/screens/Studio.tsx", "utf8");
    const toolbar = studio.split('<div className="studio-edit-toolbar">')[1]?.split("</div>")[0] ?? "";
    expect(toolbar).not.toContain("setPlaying(true)");
    expect(toolbar).not.toContain("timeLabel(playhead)");
    expect(studio).toContain('<div className="studio-playback-controls">');
    expect(studio).toContain('aria-label="재생 헤드"');
    expect(toolbar).toContain("실행 취소");
    expect(toolbar).toContain("다시 실행");
    expect(toolbar).toContain("스냅");
    expect(toolbar).toContain("확대");
  });
});
