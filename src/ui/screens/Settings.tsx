import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { SelectRoot, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "../../../seed-design/ui/select";
import { TextField, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { api, watchJob, watchJobs, type EngineJob } from "../api";
import type { SystemStatus } from "../types";
import { DEFAULT_SCRIPT_PROMPT } from "../../core/script-prompt";

type ModelStatus = {
  bgeM3: { available: boolean; ranking: "embedding" | "rules" };
  whisper: { available: boolean; sizeBytes: number };
};

type CodexModel = { slug: string; displayName: string; efforts: string[] };
type CodexModelCatalog = { source: "codex-cli" | "fallback"; models: CodexModel[] };
type ScriptPromptSettings = { prompt: string; isDefault: boolean; rulesPreview: string };

export function Settings(props: { onSnackbar: (message: string) => void; onError: (message: string) => void }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [models, setModels] = useState<ModelStatus | null>(null);
  const [codexCatalog, setCodexCatalog] = useState<CodexModelCatalog>({ source: "fallback", models: [] });
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codexSettings, setCodexSettings] = useState({ model: "gpt-6-luna", effort: "medium" });
  const [scriptPrompt, setScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);
  const [savedScriptPrompt, setSavedScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);
  const [scriptPromptRules, setScriptPromptRules] = useState<string[]>([]);
  const [scriptPromptLoading, setScriptPromptLoading] = useState(true);
  const [scriptPromptSaving, setScriptPromptSaving] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        api<SystemStatus>("GET", "/api/system").then(setStatus),
        api<ModelStatus>("GET", "/api/models").then(setModels),
        api<typeof codexSettings>("GET", "/api/system/codex-settings").then(setCodexSettings),
        api<CodexModelCatalog>("GET", "/api/system/codex-models").then(setCodexCatalog),
        api<ScriptPromptSettings>("GET", "/api/system/script-prompt").then(value => {
          setScriptPrompt(value.prompt);
          setSavedScriptPrompt(value.prompt);
          setScriptPromptRules(value.rulesPreview.split("\n"));
        }),
      ]);
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
      setScriptPromptLoading(false);
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
  const codexMessage = !status || status.codex.loggedIn ? null : status.codex.installed
    ? "터미널에서 codex login 을 실행한 뒤 다시 확인해 주세요."
    : "codex CLI를 설치한 뒤 터미널에서 codex login 을 실행해 주세요.";
  const codexState = !status ? "확인 중" : status.codex.loggedIn ? "사용할 수 있어요" : status.codex.installed ? "로그인이 필요해요" : "설치가 필요해요";
  const selectedModel = codexCatalog.models.find(model => model.slug === codexSettings.model);
  const modelOptions = selectedModel
    ? codexCatalog.models
    : [...codexCatalog.models, { slug: codexSettings.model, displayName: codexSettings.model, efforts: [] }];
  const effortOptions = selectedModel?.efforts.length ? selectedModel.efforts : ["low", "medium", "high"];

  async function updateCodexSettings(value: typeof codexSettings) {
    setCodexSettings(value);
    try { await api("PUT", "/api/system/codex-settings", value); }
    catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function saveScriptPrompt() {
    setScriptPromptSaving(true);
    try {
      const saved = await api<ScriptPromptSettings>("PUT", "/api/system/script-prompt", { prompt: scriptPrompt });
      setScriptPrompt(saved.prompt);
      setSavedScriptPrompt(saved.prompt);
      setScriptPromptRules(saved.rulesPreview.split("\n"));
      props.onSnackbar("대본 프롬프트를 저장했어요");
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setScriptPromptSaving(false);
    }
  }

  return (
    <section className="screen" aria-labelledby="settings-title">
      <header className="screen-header"><div><h1 id="settings-title" className="screen-title">설정</h1></div></header>
      {error ? <div className="page-banner-wrap"><PageBanner tone="warning" variant="weak" description={error} /></div> : null}
      <section className="section-card settings-card" aria-labelledby="codex-title">
        <div className="settings-card-heading"><h2 id="codex-title">codex</h2><span className={`status-label ${status?.codex.loggedIn ? "is-ready" : "is-warning"}`}>{codexState}</span></div>
        {codexMessage ? <div className="page-banner-wrap settings-warning"><PageBanner tone="warning" variant="weak" description={codexMessage} /></div> : null}
        {status && !status.codex.installed ? <div className="action-row"><ActionButton variant="neutralWeak" onClick={() => void chooseCodexPath()}>직접 지정</ActionButton></div> : null}
        <div className="settings-model-fields">
          <div>
            <ModelSelect
              label="모델"
              value={codexSettings.model}
              items={modelOptions.map(model => ({ value: model.slug, label: model.displayName }))}
              onChange={model => {
                const efforts = codexCatalog.models.find(item => item.slug === model)?.efforts ?? [];
                const effort = efforts.includes(codexSettings.effort) ? codexSettings.effort : efforts.includes("medium") ? "medium" : efforts[0] ?? "medium";
                void updateCodexSettings({ model, effort });
              }}
            />
          </div>
          <div>
            <ModelSelect
              label="추론 강도"
              value={codexSettings.effort}
              items={effortOptions.map(effort => ({ value: effort, label: effort }))}
              onChange={effort => void updateCodexSettings({ ...codexSettings, effort })}
            />
          </div>
        </div>
        <div className="action-row settings-actions"><ActionButton className="settings-refresh-button" variant="neutralWeak" disabled={checking} loading={checking} aria-label={checking ? "다시 확인 중" : "다시 확인"} onClick={() => void refresh()}>{checking ? "다시 확인 중" : "다시 확인"}</ActionButton></div>
      </section>
      <section className="section-card settings-card script-prompt-card" aria-labelledby="script-prompt-title">
        <h2 id="script-prompt-title" className="settings-section-title">대본 프롬프트</h2>
        <TextField label="기본 지시문" description="대본을 만들 때마다 적용할 지시문이에요." maxGraphemeCount={4000}>
          <TextFieldTextarea
            className="script-prompt-input"
            maxLength={4000}
            value={scriptPrompt}
            disabled={scriptPromptLoading || scriptPromptSaving}
            onChange={event => setScriptPrompt(event.currentTarget.value)}
          />
        </TextField>
        <div className="action-row settings-actions">
          <ActionButton variant="neutralWeak" disabled={scriptPromptLoading || scriptPromptSaving || scriptPrompt === DEFAULT_SCRIPT_PROMPT} onClick={() => setScriptPrompt(DEFAULT_SCRIPT_PROMPT)}>기본값으로 되돌리기</ActionButton>
          <ActionButton variant="brandSolid" disabled={scriptPromptLoading || scriptPromptSaving || scriptPrompt === savedScriptPrompt} loading={scriptPromptSaving} onClick={() => void saveScriptPrompt()}>저장</ActionButton>
        </div>
        <div className="script-prompt-rules" aria-labelledby="script-prompt-rules-title">
          <h3 id="script-prompt-rules-title">앱이 항상 덧붙이는 규칙</h3>
          <ul>{scriptPromptRules.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
        </div>
      </section>
      <section className="section-card settings-row" aria-labelledby="jev-title"><h2 id="jev-title">Jev 짤 판정</h2><span className={`status-label ${status?.jev.available ? "is-ready" : "is-warning"}`}>{status?.jev.available ? "연결됨" : "연결 안 됨"}</span></section>
      <section className="section-card" aria-labelledby="models-title">
        <h2 id="models-title" className="settings-section-title">모델</h2>
        <div className="model-row"><div><h3>짤 검색 모델</h3><p>{bgeJob ? "받는 동안 짤은 기본 순위로 골라요." : models?.bgeM3.available ? "짤을 검색할 때 사용해요." : "받기 전에는 짤을 기본 순위로 골라요."}</p></div>
          {bgeJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={bgeJob.progress === null ? undefined : bgeJob.progress * 100} /><span>{bgeJob.message ?? "받는 중"}{bgeJob.progress === null ? "" : ` · ${Math.round(bgeJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(bgeJob.id)}>취소</ActionButton></div> : models?.bgeM3.available ? <span className="model-ready">준비됨</span> : <ActionButton variant="neutralWeak" onClick={() => void download("bge-m3")}>받기</ActionButton>}
        </div>
        <div className="model-row"><div><h3>받아 적기 모델</h3><p>자막 만들기와 AI 추천 대본에 써요. · 574 MB</p></div>
          {whisperJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={whisperJob.progress === null ? undefined : whisperJob.progress * 100} /><span>{whisperJob.message ?? "받는 중"}{whisperJob.progress === null ? "" : ` · ${Math.round(whisperJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(whisperJob.id)}>취소</ActionButton></div> : <ActionButton variant="neutralWeak" disabled={models?.whisper.available} onClick={() => void download("whisper")}>{models?.whisper.available ? "받음" : "받기"}</ActionButton>}
        </div>
      </section>
    </section>
  );
}

function ModelSelect(props: { label: string; value: string; items: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <SelectRoot value={[props.value]} onValueChange={value => { if (value[0]) props.onChange(value[0]); }} label={props.label} size="medium">
    <SelectTrigger aria-label={props.label} />
    <SelectContent><SelectGroup>{props.items.map(item => <SelectItem key={item.value} value={item.value} label={item.label} />)}</SelectGroup></SelectContent>
  </SelectRoot>;
}
