// 작업 등록부: 취소(결정 0027)·끝난 작업 상태 고정·멈추는 중인 작업의 key 유지
import { describe, expect, it } from "vitest";
import { CANCELLED_MESSAGE, done, JobRegistry, type Job } from "../../src/engine/jobs";

const tick = () => new Promise((r) => setTimeout(r, 5));

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

describe("JobRegistry 취소", () => {
  it("취소한 heavy-media 작업은 정리가 끝날 때까지 key를 유지한다", async () => {
    const jobs = new JobRegistry(); const g = gate();
    const started = jobs.start({ kind: "tts", label: "음성 만들기", key: "heavy-media", cancellable: true }, async () => { await g.promise; return done(); });
    jobs.cancel(started.id);
    expect(jobs.findActive("heavy-media")).toMatchObject({ id: started.id, stopping: true });
    g.open(); await jobs.wait(started.id);
    expect(jobs.findActive("heavy-media")).toBeNull();
  });
  it("취소할 수 있는 작업은 신호를 받고 곧바로 discarded로 끝난다", async () => {
    const jobs = new JobRegistry();
    const g = gate();
    let seen: AbortSignal | null = null;
    const started = jobs.start({ kind: "script", label: "렌더", key: "k1", cancellable: true }, async (jc) => {
      seen = jc.signal;
      await g.promise;
      return done("late");
    });
    expect(started.cancellable).toBe(true);
    await tick();
    expect(seen!.aborted).toBe(false);

    const res = jobs.cancel(started.id);
    expect(res.result).toBe("ok");
    expect(seen!.aborted).toBe(true);
    const job = jobs.get(started.id)!;
    expect(job).toMatchObject({ status: "discarded", message: CANCELLED_MESSAGE, stopping: true });
    expect(job.finishedAt).not.toBeNull();
    g.open();
    await jobs.wait(started.id);
  });

  it("없는 작업·끝난 작업·취소할 수 없는 작업은 거절한다", async () => {
    const jobs = new JobRegistry();
    expect(jobs.cancel("nope").result).toBe("not-found");

    const plain = jobs.start({ kind: "script", label: "대본" }, async (jc) => {
      await tick();
      expect(jc.signal.aborted).toBe(false);
      return done();
    });
    expect(plain.cancellable).toBe(false);
    expect(jobs.cancel(plain.id).result).toBe("not-cancellable");
    expect((await jobs.wait(plain.id)).status).toBe("done");

    const quick = jobs.start({ kind: "script", label: "렌더", cancellable: true }, async () => done());
    await jobs.wait(quick.id);
    expect(jobs.cancel(quick.id).result).toBe("not-cancellable");
    const again = jobs.start({ kind: "script", label: "렌더", cancellable: true }, async () => {
      await tick();
      return done();
    });
    expect(jobs.cancel(again.id).result).toBe("ok");
    expect(jobs.cancel(again.id).result).toBe("not-cancellable");
    await jobs.wait(again.id);
  });

  it("취소한 뒤 작업 함수가 반환하거나 던져도 상태는 discarded 그대로다", async () => {
    const jobs = new JobRegistry();
    for (const how of ["return", "throw"] as const) {
      const g = gate();
      const seen: Job[] = [];
      jobs.subscribe((j) => seen.push(j));
      const j = jobs.start({ kind: "script", label: "렌더", cancellable: true }, async () => {
        await g.promise;
        if (how === "throw") throw new Error("늦게 던짐");
        return done("늦은 결과");
      });
      await tick();
      jobs.cancel(j.id);
      g.open();
      await jobs.wait(j.id);
      const final = jobs.get(j.id)!;
      expect(final).toMatchObject({ status: "discarded", message: CANCELLED_MESSAGE, error: null, result: null, stopping: false });
      // 끝난 뒤 done/failed로 다시 쓰이지 않았다
      expect(seen.filter((s) => s.id === j.id && (s.status === "done" || s.status === "failed"))).toHaveLength(0);
    }
  });

  it("작업 함수가 끝나기 전에는 findActive(key)가 멈추는 중인 작업을 돌려준다", async () => {
    const jobs = new JobRegistry();
    const g = gate();
    const j = jobs.start({ kind: "script", projectId: "p1", label: "제품 컷", key: "product-shots:p1", cancellable: true }, async () => {
      await g.promise;
      return done();
    });
    jobs.cancel(j.id);
    expect(jobs.findActive("product-shots:p1")).toMatchObject({ id: j.id, status: "discarded", stopping: true });
    expect(jobs.hasActiveForProject("p1")).toBe(true);
    g.open();
    await jobs.wait(j.id);
    expect(jobs.findActive("product-shots:p1")).toBeNull();
    expect(jobs.hasActiveForProject("p1")).toBe(false);
  });

  it("작업이 멈추면 stopping:false를 한 번 더 알린다", async () => {
    const jobs = new JobRegistry();
    const g = gate();
    const seen: Array<Pick<Job, "status" | "stopping">> = [];
    jobs.subscribe((j) => seen.push({ status: j.status, stopping: j.stopping }));
    const j = jobs.start({ kind: "script", label: "렌더", cancellable: true }, async () => {
      await g.promise;
      return done();
    });
    jobs.cancel(j.id);
    g.open();
    await jobs.wait(j.id);
    expect(seen.at(-2)).toEqual({ status: "discarded", stopping: true });
    expect(seen.at(-1)).toEqual({ status: "discarded", stopping: false });
  });

  it("큐에서 시작하기 전에 취소하면 작업 함수를 부르지 않는다", async () => {
    const jobs = new JobRegistry();
    let called = false;
    const j = jobs.start({ kind: "script", label: "렌더", cancellable: true, queued: true }, async () => {
      called = true;
      return done();
    });
    jobs.cancel(j.id);
    await jobs.wait(j.id);
    expect(called).toBe(false);
    expect(jobs.get(j.id)).toMatchObject({ status: "discarded", message: CANCELLED_MESSAGE, stopping: false });
  });
});
