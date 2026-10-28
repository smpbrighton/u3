import { describe, expect, it, vi } from "vitest";
import { SettingsSaves } from "../../src/ui/settings/settings-save";

describe("설정 자동 저장", () => {
  it("앞선 저장이 늦어져도 다른 구역의 변경을 순서대로 보존한다", async () => {
    const saves = new SettingsSaves();
    const settings = { model: "flare", speaker: "Sohee" };
    let finish!: () => void;
    const first = saves.run("image", async () => {
      const snapshot = { ...settings };
      await new Promise<void>(resolve => { finish = resolve; });
      Object.assign(settings, snapshot, { model: "sunburst" });
    });
    const voice = vi.fn(async () => { const snapshot = { ...settings }; Object.assign(settings, snapshot, { speaker: "Ryan" }); });
    const second = saves.run("voice", voice);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(voice).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, second]);
    await saves.flush();
    expect(settings).toEqual({ model: "sunburst", speaker: "Ryan" });
  });

  it("다른 구역을 저장해도 실패를 유지하고 해당 구역을 다시 저장하면 다시 시작을 허용한다", async () => {
    const saves = new SettingsSaves();
    await expect(saves.run("brand", async () => { throw new Error("브랜드 저장 실패"); })).rejects.toThrow("브랜드 저장 실패");
    await saves.run("voice", async () => undefined);
    await expect(saves.flush()).rejects.toThrow("브랜드 저장 실패");
    await saves.run("brand", async () => undefined);
    await expect(saves.flush()).resolves.toBeUndefined();
  });
});
