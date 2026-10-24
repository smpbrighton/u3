import { appendFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileUsageLog, makeUsageEntry, memoryUsageLog, monthKey, monthlyTotals, usageFile } from "../../src/engine/pipeline/usage";

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "u3-usage-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("Codex and Jev usage", () => {
  it("uses local YYYY-MM dates and validates provider names", () => {
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe("2026-01");
    expect(makeUsageEntry({ provider: "codex", unit: "input_tokens", amount: 12, projectId: "p1" }))
      .toMatchObject({ provider: "codex", unit: "input_tokens", retry: false });
    expect(makeUsageEntry({ provider: "jev", unit: "calls", amount: 1, projectId: null }).provider).toBe("jev");
  });

  it("serializes file writes, ignores damaged lines, and aggregates retry and library amounts", async () => {
    const root = path.join(directory, "log");
    const log = fileUsageLog(root);
    const now = new Date(2026, 8, 3, 9);
    expect(await log.readAll()).toEqual([]);
    await Promise.all([
      log.append([makeUsageEntry({ provider: "codex", unit: "input_tokens", amount: 50, projectId: "p1", now })]),
      log.append([makeUsageEntry({ provider: "jev", unit: "input_tokens", amount: 8, projectId: null, retry: true, now })]),
    ]);
    await appendFile(usageFile(root), "bad json\n{\"provider\":\"other\"}\n", "utf8");
    const entries = await log.readAll();
    expect(entries).toHaveLength(2);
    const totals = monthlyTotals(entries);
    expect(totals[0]!.month).toBe("2026-09");
    expect(totals[0]!.totals).toEqual([
      { provider: "codex", unit: "input_tokens", amount: 50, retryAmount: 0, entries: 1, libraryAmount: 0 },
      { provider: "jev", unit: "input_tokens", amount: 8, retryAmount: 8, entries: 1, libraryAmount: 8 },
    ]);
  });

  it("does not accept malformed rows in the memory log", async () => {
    const log = memoryUsageLog();
    await expect(log.append([{ provider: "other" } as never])).rejects.toThrow();
    expect(log.entries).toEqual([]);
  });
});
