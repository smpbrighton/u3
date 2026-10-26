import { afterEach, describe, expect, it } from "vitest";
import { ImageQueue } from "../../src/engine/image-queue";

const queues: ImageQueue[] = [];
afterEach(async () => {
  await Promise.all(queues.splice(0).map(queue => queue.onIdle()));
});

describe("ImageQueue", () => {
  it("respects configured concurrency and applies changes to queued work", async () => {
    const queue = new ImageQueue(2);
    queues.push(queue);
    let running = 0;
    let maxRunning = 0;
    const task = () => queue.add(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 15));
      running--;
    });
    await Promise.all([task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);

    queue.setConcurrency(1);
    maxRunning = 0;
    await Promise.all([task(), task(), task()]);
    expect(maxRunning).toBe(1);
  });

  it("cancels a queued image task", async () => {
    const queue = new ImageQueue(1);
    queues.push(queue);
    let release!: () => void;
    const blocking = queue.add(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const controller = new AbortController();
    let ran = false;
    const queued = queue.add(() => { ran = true; }, controller.signal);
    controller.abort();
    release();
    await blocking;
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(ran).toBe(false);
  });
});
