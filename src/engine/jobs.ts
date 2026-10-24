import PQueue from "p-queue";
import { randomBytes } from "node:crypto";
export type Job = { id: string; status: "queued"|"running"|"done"|"failed"|"cancelled"; progress: number|null; message: string|null; error?: string };
export class Jobs {
  readonly queue = new PQueue({ concurrency: 2 });
  private values = new Map<string, Job>(); private listeners = new Set<(job: Job) => void>(); private controllers = new Map<string, AbortController>();
  subscribe(fn: (job: Job) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(j: Job) { for (const fn of this.listeners) fn({ ...j }); }
  list() { return [...this.values.values()].map(j => ({ ...j })); }
  cancel(id: string) { const j=this.values.get(id); if(!j || !this.controllers.has(id)) return false; this.controllers.get(id)!.abort(); j.status="cancelled"; j.message="취소했습니다"; this.emit(j); return true; }
  enqueue(label: string, run: (ctx: { signal: AbortSignal; progress: (n: number, message?: string) => void }) => Promise<unknown>) {
    const id = `job-${randomBytes(5).toString("hex")}`, job: Job={id,status:"queued",progress:null,message:label}, controller=new AbortController(); this.values.set(id,job); this.controllers.set(id,controller); this.emit(job);
    void this.queue.add(async()=>{ if(controller.signal.aborted) return; job.status="running"; this.emit(job); try { await run({ signal:controller.signal, progress:(n,m)=>{if(!controller.signal.aborted){job.progress=Math.max(0,Math.min(1,n));job.message=m??job.message;this.emit(job);}} }); if(!controller.signal.aborted){job.status="done";job.progress=1;this.emit(job);} } catch(e) { if(!controller.signal.aborted){job.status="failed";job.error=e instanceof Error?e.message:String(e);this.emit(job);} } finally {this.controllers.delete(id);} });
    return job;
  }
}
