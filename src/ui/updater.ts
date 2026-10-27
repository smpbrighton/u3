import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdateSnapshot = {
  currentVersion: string;
  lastCheckedAt: number | null;
  checking: boolean;
  revision: number;
} & ({ status: "idle" } | { status: "downloading"; percent: number } | { status: "ready"; version: string } | { status: "failed"; message: string });

export function updateLine(status: UpdateSnapshot | null): string | null {
  if (status?.status === "downloading") return `업데이트 받는 중 ${status.percent}%`;
  if (status?.status === "ready") return `새 버전 ${status.version}`;
  return null;
}

export function updateReceiver(onStatus: (status: UpdateSnapshot) => void, onError: (message: string) => void) {
  let revision = -1;
  return (status: UpdateSnapshot) => {
    if (status.revision <= revision) return;
    revision = status.revision;
    onStatus(status);
    if (status.status === "failed") onError(status.message);
  };
}

export async function subscribeUpdates(receive: (status: UpdateSnapshot) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  // 조회보다 이벤트가 먼저 오면 revision이 작은 조회 결과를 무시한다.
  const stop = await listen<UpdateSnapshot>("update-status", event => receive(event.payload));
  try { receive(await invoke<UpdateSnapshot>("update_status")); }
  catch (error) { stop(); throw error; }
  return stop;
}

export const checkUpdateNow = () => invoke<UpdateSnapshot>("update_check_now");
export const restartUpdate = () => invoke<void>("update_restart");

export class RestartSaves {
  private saves = new Set<() => Promise<void>>();
  register(save: () => Promise<void>): () => void {
    this.saves.add(save);
    return () => { this.saves.delete(save); };
  }
  async saveAll(): Promise<void> {
    for (const save of [...this.saves]) await save();
  }
}

export class RestartController {
  private running = false;
  constructor(private readonly deps: { getBusy: () => Promise<{ busy: boolean }>; saves: RestartSaves; restart: () => Promise<void> }) {}
  async request(confirmed = false): Promise<"confirm" | "restarting" | "busy"> {
    if (this.running) return "busy";
    this.running = true;
    try {
      const { busy } = await this.deps.getBusy();
      if (busy && !confirmed) return "confirm";
      await this.deps.saves.saveAll();
      await this.deps.restart();
      return "restarting";
    } finally { this.running = false; }
  }
}
