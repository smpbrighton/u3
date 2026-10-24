// 사용량 기록. uUu src/pipeline/usage.ts의 원자적 추가·깨진 줄 무시·월 집계를 유지하고 제공자는 Codex와 Jev로 제한한다.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const UsageEntry = z.object({
  ts: z.string().datetime(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  projectId: z.string().nullable(),
  provider: z.enum(["codex", "jev"]),
  unit: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  retry: z.boolean().default(false),
});
export type UsageEntry = z.infer<typeof UsageEntry>;
export type UsageProvider = UsageEntry["provider"];

export interface UsageLog {
  append(entries: UsageEntry[]): Promise<void>;
  readAll(): Promise<UsageEntry[]>;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function makeUsageEntry(params: {
  provider: UsageProvider;
  unit: string;
  amount: number;
  projectId: string | null;
  retry?: boolean;
  now?: Date;
}): UsageEntry {
  const now = params.now ?? new Date();
  return UsageEntry.parse({
    ts: now.toISOString(),
    month: monthKey(now),
    projectId: params.projectId,
    provider: params.provider,
    unit: params.unit,
    amount: params.amount,
    retry: params.retry ?? false,
  });
}

export function usageFile(root: string): string {
  return path.join(root, "usage.jsonl");
}

export function fileUsageLog(root: string): UsageLog {
  const file = usageFile(root);
  let chain: Promise<void> = Promise.resolve();
  return {
    append(entries) {
      if (!entries.length) return chain;
      const text = entries.map(entry => `${JSON.stringify(UsageEntry.parse(entry))}\n`).join("");
      const next = chain.then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, text, "utf8");
      });
      chain = next.catch(() => undefined);
      return next;
    },
    async readAll() {
      await chain;
      let content: string;
      try {
        content = await readFile(file, "utf8");
      } catch {
        return [];
      }
      const entries: UsageEntry[] = [];
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = UsageEntry.safeParse(JSON.parse(line));
          if (parsed.success) entries.push(parsed.data);
        } catch {
          // 손상된 줄은 건너뛴다.
        }
      }
      return entries;
    },
  };
}

export async function readUsage(root: string): Promise<UsageEntry[]> {
  return fileUsageLog(root).readAll();
}

export async function recordUsage(root: string, provider: UsageProvider, amount: number): Promise<void> {
  await fileUsageLog(root).append([makeUsageEntry({ provider, unit: "requests", amount, projectId: null })]);
}

export function memoryUsageLog(): UsageLog & { entries: UsageEntry[] } {
  const entries: UsageEntry[] = [];
  return {
    entries,
    async append(batch) {
      entries.push(...batch.map(entry => UsageEntry.parse(entry)));
    },
    async readAll() {
      return [...entries];
    },
  };
}

export type UsageTotal = {
  provider: UsageProvider;
  unit: string;
  amount: number;
  retryAmount: number;
  entries: number;
  libraryAmount: number;
};
export type MonthlyUsage = { month: string; totals: UsageTotal[] };
const PROVIDER_ORDER: UsageProvider[] = ["codex", "jev"];
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function monthlyTotals(entries: readonly UsageEntry[]): MonthlyUsage[] {
  const months = new Map<string, Map<string, UsageTotal>>();
  for (const entry of entries) {
    let month = months.get(entry.month);
    if (!month) months.set(entry.month, month = new Map());
    const key = `${entry.provider}\0${entry.unit}`;
    let total = month.get(key);
    if (!total) month.set(key, total = { provider: entry.provider, unit: entry.unit, amount: 0, retryAmount: 0, entries: 0, libraryAmount: 0 });
    total.amount += entry.amount;
    if (entry.retry) total.retryAmount += entry.amount;
    if (entry.projectId === null) total.libraryAmount += entry.amount;
    total.entries++;
  }
  return [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, totals]) => ({
    month,
    totals: [...totals.values()].map(total => ({
      ...total,
      amount: round6(total.amount),
      retryAmount: round6(total.retryAmount),
      libraryAmount: round6(total.libraryAmount),
    })).sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider) || a.unit.localeCompare(b.unit)),
  }));
}
