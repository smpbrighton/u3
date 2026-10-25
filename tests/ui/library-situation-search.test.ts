import { describe, expect, it } from "vitest";
import * as requests from "../../src/ui/studio/library-request";

describe("situation search requests", () => {
  it("aborts the previous request and marks only the newest response current", () => {
    expect(requests.createAbortableRequestGuard).toBeTypeOf("function");
    const guard = requests.createAbortableRequestGuard();
    const previous = guard.begin();
    const latest = guard.begin();

    expect(previous.signal.aborted).toBe(true);
    expect(previous.isCurrent()).toBe(false);
    expect(latest.signal.aborted).toBe(false);
    expect(latest.isCurrent()).toBe(true);
  });
});
