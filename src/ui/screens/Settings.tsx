import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { api, watchJob, watchJobs, type EngineJob } from "../api";
import type { SystemStatus } from "../types";

type ModelStatus = {
  bgeM3: { available: boolean; ranking: "embedding" | "rules" };
  whisper: { available: boolean; sizeBytes: number };
};

export function Settings(props: { onSnackbar: (message: string) => void; onError: (message: string) => void }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [models, setModels] = useState<ModelStatus | null>(null);
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const [system, modelStatus] = await Promise.all([
        api<SystemStatus>("GET", "/api/system"),
        api<ModelStatus>("GET", "/api/models"),
      ]);
      setStatus(system);
      setModels(modelStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void watchJobs(received => {
      setJobs(current => {
        const next = new Map(current.map(job => [job.id, job]));
        for (const job of received) if (job.kind === "models") next.set(job.id, job);
        return [...next.values()].filter(job => ["queued", "running"].includes(job.status));
      });
    }, controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function chooseCodexPath() {
    try {
      const selected = await open({ multiple: false, directory: false, title: "codex 실행 파일 선택" });
      if (typeof selected !== "string") return;
      await api("PUT", "/api/system/codex-path", { path: selected });
      await refresh();
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function download(model: "bge-m3" | "whisper") {
    try {
      const job = await api<EngineJob>("POST", "/api/models/download", { model });
      setJobs(current => [...current.filter(item => item.id !== job.id), job]);
      const controller = new AbortController();
      const final = await watchJob(job.id, update => setJobs(current => [...current.filter(item => item.id !== update.id), update]), controller.signal);
      if (final.status === "done") props.onSnackbar(model === "whisper" ? "받아 적기 모델을 받았어요." : "짤 검색 모델을 받았어요.");
      else if (final.status === "failed") props.onError(final.error ?? "모델을 받지 못했어요.");
      await refresh();
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function cancel(jobId: string) {
    try {
      await api("DELETE", `/api/jobs/${jobId}`);
      setJobs(current => current.filter(job => job.id !== jobId));
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const modelJob = (name: string) => jobs.find(job => job.label?.toLowerCase().includes(name) && ["queued", "running"].includes(job.status));
  const bgeJob = modelJob("bge-m3");
  const whisperJob = modelJob("whisper");
  const codexMessage = status?.codex.loggedIn ? null : status?.codex.installed
    ? "터미널에서 codex login 을 실행한 뒤 다시 확인해 주세요."
    : "codex CLI를 설치한 뒤 터미널에서 codex login 을 실행해 주세요.";

  return (
    <section className="screen" aria-labelledby="settings-title">
      <header className="screen-header"><div><h1 id="settings-title" className="screen-title">설정</h1></div></header>
      {error ? <div className="page-banner-wrap"><PageBanner tone="warning" variant="weak" description={error} /></div> : null}
      <section className="section-card settings-card" aria-labelledby="codex-title">
        <div className="settings-card-heading"><h2 id="codex-title">codex</h2><span className={`status-label ${status?.codex.loggedIn ? "is-ready" : "is-warning"}`}>{status?.codex.loggedIn ? "로그인됨" : status?.codex.installed ? "로그인 안 됨" : "설치 안 됨"}</span></div>
        {codexMessage ? <div className="page-banner-wrap settings-warning"><PageBanner tone="warning" variant="weak" description={codexMessage} /></div> : null}
        <dl className="settings-details">
          <dt>실행 파일</dt><dd><code>{status?.codexPath ?? "찾을 수 없어요"}</code><ActionButton variant="neutralWeak" size="small" onClick={() => void chooseCodexPath()}>바꾸기</ActionButton></dd>
          <dt>모델</dt><dd><code>gpt-6-luna</code></dd>
        </dl>
        <div className="action-row settings-actions"><ActionButton variant="brandSolid" disabled={checking} loading={checking} onClick={() => void refresh()}>다시 확인</ActionButton></div>
      </section>
      <section className="section-card settings-row" aria-labelledby="jev-title"><h2 id="jev-title">Jev 짤 판정</h2><span className={`status-label ${status?.jev.available ? "is-ready" : "is-warning"}`}>{status?.jev.available ? "연결됨" : "연결 안 됨"}</span></section>
      <section className="section-card" aria-labelledby="models-title">
        <h2 id="models-title" className="settings-section-title">모델</h2>
        <div className="model-row"><div><h3>짤 검색 모델</h3><p>{bgeJob ? "받는 동안 짤은 기본 순위로 골라요." : models?.bgeM3.available ? "받았어요." : "받기 전에는 짤을 기본 순위로 골라요."}</p></div>
          {bgeJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={bgeJob.progress === null ? undefined : bgeJob.progress * 100} /><span>{bgeJob.message ?? "받는 중"}{bgeJob.progress === null ? "" : ` · ${Math.round(bgeJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(bgeJob.id)}>취소</ActionButton></div> : <ActionButton variant="neutralWeak" disabled={models?.bgeM3.available} onClick={() => void download("bge-m3")}>{models?.bgeM3.available ? "받음" : "받기"}</ActionButton>}
        </div>
        <div className="model-row"><div><h3>받아 적기 모델</h3><p>자막 만들기와 AI 추천 대본에 써요. · 574 MB</p></div>
          {whisperJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={whisperJob.progress === null ? undefined : whisperJob.progress * 100} /><span>{whisperJob.message ?? "받는 중"}{whisperJob.progress === null ? "" : ` · ${Math.round(whisperJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(whisperJob.id)}>취소</ActionButton></div> : <ActionButton variant="neutralWeak" disabled={models?.whisper.available} onClick={() => void download("whisper")}>{models?.whisper.available ? "받음" : "받기"}</ActionButton>}
        </div>
      </section>
    </section>
  );
}
