// 작업 목록(대본 생성·장면 재생성·음성 합성·이미지 생성·렌더·짤 가져오기·짤 고르기·허브 배포·링크로 영상 만들기·장면 화면 자동으로 붙이기).
// 작업은 메모리에만 있다(서버를 다시 켜면 사라진다). 결과를 프로젝트에 넣을지는 작업 함수가 버전을 확인하고 정한다.
// 늦게 끝나 버전이 맞지 않는 작업은 "discarded"로 끝낸다(I-1).
import { randomBytes } from "node:crypto";
import PQueue from "p-queue";

export type JobKind = "script" | "meme-rank" | "frames" | "render" | "separate" | "transcribe" | "models" | "image";
export type JobStatus = "queued" | "running" | "done" | "failed" | "discarded";

export interface Job {
  id: string;
  kind: JobKind;
  projectId: string | null;
  sceneIndex: number | null;
  label: string;
  status: JobStatus;
  /** 0..1, 모르면 null */
  progress: number | null;
  message: string | null;
  error: string | null;
  result: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** 같은 일을 두 번 시작하지 않게 하는 key */
  key: string | null;
  /** 화면이 취소 버튼을 그릴지(렌더·제품 컷 만들기만 true, 결정 0027) */
  cancellable: boolean;
  /** 취소했지만 작업 함수가 아직 멈추지 않았다. 이 동안은 같은 key의 작업을 새로 시작하지 못한다 */
  stopping: boolean;
}

export interface JobSpec {
  kind: JobKind;
  projectId?: string | null;
  sceneIndex?: number | null;
  label: string;
  key?: string;
  /** true면 "queued"로 시작하고, 작업 함수가 ctx.start()를 부를 때 "running"이 된다 */
  queued?: boolean;
  /** true면 cancel(id)로 취소할 수 있고, 작업 함수가 ctx.signal을 받는다 */
  cancellable?: boolean;
}

/** 사용자가 취소한 작업의 메시지. 화면은 이 메시지의 discarded를 "취소함"으로 보인다 */
export const CANCELLED_MESSAGE = "취소했습니다";

export type CancelResult = { result: "ok"; job: Job } | { result: "not-found" } | { result: "not-cancellable" };

export type JobOutcome = { kind: "done"; result?: unknown; message?: string } | { kind: "discarded"; message: string };

export const done = (result?: unknown, message?: string): JobOutcome => ({ kind: "done", result, message });
export const discarded = (message: string): JobOutcome => ({ kind: "discarded", message });

export interface JobContext {
  readonly job: Readonly<Job>;
  progress(p: number | null, message?: string): void;
  /** 대기열에서 차례가 와서 실제로 시작했다 */
  start(): void;
  /** 취소하면 abort된다. 취소할 수 없는 작업의 신호는 abort되지 않는다 */
  readonly signal: AbortSignal;
}

export type JobListener = (job: Job) => void;

export interface JobExecutionHooks {
  /** 등록 시 실행 문맥을 고정함. 공개 Job에는 넣지 않음. */
  bind?: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;
}

const ACTIVE: ReadonlySet<JobStatus> = new Set(["queued", "running"]);

export function isActive(job: Pick<Job, "status">): boolean {
  return ACTIVE.has(job.status);
}

export class JobRegistry {
  readonly queue: PQueue;
  private jobs = new Map<string, Job>();
  private listeners = new Set<JobListener>();
  private waiters = new Map<string, Promise<Job>>();
  private cancellers = new Map<string, () => Job>();
  private controllers = new Set<AbortController>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly maxFinished = 200,
    private readonly execution: JobExecutionHooks = {},
    concurrency = 2,
  ) {
    this.queue = new PQueue({ concurrency });
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private emit(job: Job): void {
    const snap = { ...job };
    for (const l of [...this.listeners]) {
      try {
        l(snap);
      } catch (e) {
        console.error("[jobs] listener", e);
      }
    }
  }

  subscribe(l: JobListener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  get(id: string): Job | null {
    const j = this.jobs.get(id);
    return j ? { ...j } : null;
  }

  /** 최근에 만든 것이 먼저 */
  list(filter: { projectId?: string } = {}): Job[] {
    return [...this.jobs.values()]
      .filter((j) => !filter.projectId || j.projectId === filter.projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((j) => ({ ...j }));
  }

  /** key가 같은, 아직 끝나지 않은 작업(취소했지만 멈추는 중인 것 포함) */
  findActive(key: string): Job | null {
    for (const j of this.jobs.values()) if (j.key === key && (isActive(j) || j.stopping)) return { ...j };
    return null;
  }

  /** 그 영상에서 아직 끝나지 않은 kind 작업(취소했지만 멈추는 중인 것 포함) */
  findActiveOfKind(projectId: string, kind: JobKind): Job | null {
    for (const j of this.jobs.values()) if (j.projectId === projectId && j.kind === kind && (isActive(j) || j.stopping)) return { ...j };
    return null;
  }

  hasActiveForProject(projectId: string): boolean {
    for (const j of this.jobs.values()) if (j.projectId === projectId && (isActive(j) || j.stopping)) return true;
    return false;
  }

  /** 취소할 수 있는 작업이면 신호를 보내고 곧바로 discarded("취소했습니다")로 끝낸다 */
  cancel(id: string): CancelResult {
    const j = this.jobs.get(id);
    if (!j) return { result: "not-found" };
    const c = this.cancellers.get(id);
    if (!c || !j.cancellable || !isActive(j)) return { result: "not-cancellable" };
    return { result: "ok", job: c() };
  }

  /** 작업이 끝날 때까지 기다린다(테스트·짧은 작업용) */
  wait(id: string): Promise<Job> {
    const w = this.waiters.get(id);
    if (w) return w;
    const j = this.jobs.get(id);
    if (!j) return Promise.reject(new Error(`작업이 없습니다: ${id}`));
    return Promise.resolve({ ...j });
  }

  start(spec: JobSpec, fn: (ctx: JobContext) => Promise<JobOutcome>): Job {
    return this.register(spec, fn, this.queue);
  }

  /** 이미지 전용 큐에서 실행하되 같은 Job·이벤트 형식으로 등록한다. */
  startImage(spec: Omit<JobSpec, "kind">, fn: (ctx: JobContext) => Promise<JobOutcome>, queue: PQueue): Job {
    return this.register({ ...spec, kind: "image" }, fn, queue);
  }

  private register(spec: JobSpec, fn: (ctx: JobContext) => Promise<JobOutcome>, queue: PQueue): Job {
    const execute = this.execution.bind ? this.execution.bind(fn) : fn;
    const id = `${spec.kind}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const job: Job = {
      id,
      kind: spec.kind,
      projectId: spec.projectId ?? null,
      sceneIndex: spec.sceneIndex ?? null,
      label: spec.label,
      status: spec.queued ? "queued" : "running",
      progress: null,
      message: spec.queued ? "차례를 기다리는 중" : null,
      error: null,
      result: null,
      createdAt: this.iso(),
      startedAt: spec.queued ? null : this.iso(),
      finishedAt: null,
      key: spec.key ?? null,
      cancellable: spec.cancellable ?? false,
      stopping: false,
    };
    this.jobs.set(id, job);
    this.emit(job);

    const controller = new AbortController();
    this.controllers.add(controller);
    let lastSent = { p: job.progress, m: job.message };
    const ctx: JobContext = {
      job,
      signal: controller.signal,
      progress: (p, message) => {
        if (!isActive(job)) return;
        const clamped = p === null ? null : Math.max(0, Math.min(1, p));
        job.progress = clamped;
        if (message !== undefined) job.message = message;
        const moved =
          clamped === null ||
          lastSent.p === null ||
          Math.abs(clamped - lastSent.p) >= 0.01 ||
          clamped === 1 ||
          job.message !== lastSent.m;
        if (moved) {
          lastSent = { p: job.progress, m: job.message };
          this.emit(job);
        }
      },
      start: () => {
        if (job.status !== "queued") return;
        job.status = "running";
        job.startedAt = this.iso();
        job.message = null;
        lastSent = { p: job.progress, m: job.message };
        this.emit(job);
      },
    };

    // 한 번 끝난 작업은 상태를 다시 쓰지 않는다(취소한 뒤 작업 함수가 늦게 반환하거나 던져도 무시)
    let finished = false;
    const finish = (patch: Partial<Job>) => {
      if (finished) return { ...job };
      finished = true;
      Object.assign(job, patch, { finishedAt: this.iso() });
      if (!job.startedAt) job.startedAt = job.finishedAt;
      this.emit(job);
      this.prune();
      return { ...job };
    };

    if (job.cancellable) {
      this.cancellers.set(id, () => {
        job.stopping = true;
        controller.abort();
        return finish({ status: "discarded", message: CANCELLED_MESSAGE });
      });
    }

    const run = queue.add(async () => {
      // 작업 함수는 다음 틱에 부른다. 부른 쪽이 먼저 응답(202)을 돌려줄 수 있게.
      await Promise.resolve();
      if (job.status === "queued") ctx.start();
      try {
        const out = controller.signal.aborted ? discarded(CANCELLED_MESSAGE) : await execute(ctx);
        if (out.kind === "done") return finish({ status: "done", progress: 1, result: out.result ?? null, message: out.message ?? job.message });
        return finish({ status: "discarded", message: out.message });
      } catch (e) {
        return finish({ status: "failed", error: e instanceof Error ? e.message : String(e) });
      } finally {
        this.cancellers.delete(id);
        this.controllers.delete(controller);
        if (job.stopping) {
          // 작업 함수가 실제로 멈췄다. 이제 같은 key로 다시 시작할 수 있다
          job.stopping = false;
          this.emit(job);
        }
      }
    });
    this.waiters.set(id, run);
    void run.then(() => this.waiters.delete(id));
    return { ...job };
  }

  async shutdown(): Promise<void> {
    for (const controller of this.controllers) controller.abort();
    await this.queue.onIdle();
  }

  private prune(): void {
    // 멈추는 중인 작업은 key를 잡고 있어야 하므로 지우지 않는다
    const finished = [...this.jobs.values()].filter((j) => !isActive(j) && !j.stopping).sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
    for (let i = 0; i < finished.length - this.maxFinished; i++) this.jobs.delete(finished[i]!.id);
  }
}

/** 엔진 라우트에서 쓰는 간단한 큐 인터페이스. 실제 상태는 uUu JobRegistry를 따른다. */
export class Jobs extends JobRegistry {
  enqueue(label: string, run: (context: { signal: AbortSignal; progress: (value: number, message?: string) => void }) => Promise<unknown>): Job {
    return this.start({ kind: "script", label, queued: true, cancellable: true }, async context => {
      const result = await run({
        signal: context.signal,
        progress: (value, message) => context.progress(value, message),
      });
      return done(result);
    });
  }
}
