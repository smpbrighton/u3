import { describe, expect, it, vi } from "vitest";
import { RestartController, RestartSaves, updateLine, updateReceiver, type UpdateSnapshot } from "../../src/ui/updater";

const idle: UpdateSnapshot = { status: "idle", currentVersion: "0.2.0", lastCheckedAt: null, checking: false, revision: 0 };

describe("업데이트 상태", () => {
  it("확인 중·최신·실패 상태는 사이드바에 표시하지 않는다", () => {
    expect(updateLine(idle)).toBeNull();
    expect(updateLine({ ...idle, checking: true })).toBeNull();
    expect(updateLine({ ...idle, status: "failed", message: "실패" })).toBeNull();
    expect(updateLine({ ...idle, status: "downloading", percent: 42 })).toBe("업데이트 받는 중 42%");
    expect(updateLine({ ...idle, status: "ready", version: "0.2.1" })).toBe("새 버전 0.2.1");
  });

  it("이벤트보다 늦게 도착한 상태 조회를 무시하고 실패는 한 번만 알린다", () => {
    const status = vi.fn(), error = vi.fn();
    const receive = updateReceiver(status, error);
    const failed: UpdateSnapshot = { ...idle, status: "failed", message: "서명 오류", revision: 3 };
    receive(failed); receive(failed); receive({ ...idle, revision: 2 });
    expect(status).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledExactlyOnceWith("서명 오류");
    receive({ ...idle, revision: 4 });
    receive({ ...failed, revision: 5 });
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe("업데이트 다시 시작", () => {
  function setup(busy = false) {
    const saves = new RestartSaves();
    const save = vi.fn(async (): Promise<void> => undefined);
    saves.register(save);
    const restart = vi.fn(async () => undefined);
    const getBusy = vi.fn(async () => ({ busy }));
    return { save, restart, getBusy, saves, control: new RestartController({ getBusy, saves, restart }) };
  }

  it("진행 중 작업이 있으면 저장·종료 전에 확인을 요구한다", async () => {
    const s = setup(true);
    expect(await s.control.request()).toBe("confirm");
    expect(s.save).not.toHaveBeenCalled();
    expect(s.restart).not.toHaveBeenCalled();
    expect(await s.control.request(true)).toBe("restarting");
    expect(s.save).toHaveBeenCalledOnce();
    expect(s.restart).toHaveBeenCalledOnce();
  });

  it("현재 편집 내용을 기존 저장 함수로 저장한 뒤 종료한다", async () => {
    const s = setup();
    let finish!: () => void;
    s.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = s.control.request();
    await vi.waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.restart).not.toHaveBeenCalled();
    expect(await s.control.request()).toBe("busy");
    finish();
    expect(await pending).toBe("restarting");
    expect(s.restart).toHaveBeenCalledOnce();
  });

  it("저장 실패나 엔진 상태 조회 실패 때 다시 시작하지 않는다", async () => {
    const s = setup();
    s.save.mockRejectedValueOnce(new Error("저장 실패"));
    await expect(s.control.request()).rejects.toThrow("저장 실패");
    expect(s.restart).not.toHaveBeenCalled();
    s.getBusy.mockRejectedValueOnce(new Error("엔진 연결 실패"));
    await expect(s.control.request()).rejects.toThrow("엔진 연결 실패");
    expect(s.restart).not.toHaveBeenCalled();
  });

  it("닫은 화면의 오래된 프로젝트를 저장하지 않는다", async () => {
    const saves = new RestartSaves();
    const old = vi.fn(async () => undefined);
    const remove = saves.register(old);
    remove();
    const current = vi.fn(async () => undefined);
    saves.register(current);
    await saves.saveAll();
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
  });
});
