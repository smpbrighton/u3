import PQueue from "p-queue";

export class ImageQueue {
  readonly queue: PQueue;

  constructor(concurrency = 3) {
    this.queue = new PQueue({ concurrency: ImageQueue.validateConcurrency(concurrency) });
  }

  static validateConcurrency(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 10) throw new RangeError("이미지 동시 실행 수는 1~10이어야 합니다");
    return value;
  }

  setConcurrency(concurrency: number): void {
    this.queue.concurrency = ImageQueue.validateConcurrency(concurrency);
  }

  add<T>(task: () => Promise<T> | T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException("작업이 취소되었습니다", "AbortError"));
    let removeAbort = () => {};
    const aborted = signal ? new Promise<never>((_, reject) => {
      const onAbort = () => reject(new DOMException("작업이 취소되었습니다", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => signal.removeEventListener("abort", onAbort);
    }) : null;
    const run = this.queue.add(task, signal ? { signal } : {});
    return (aborted ? Promise.race([run, aborted]) : run).finally(removeAbort);
  }

  onIdle(): Promise<void> { return this.queue.onIdle(); }
}
