import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner } from "../../../seed-design/ui/page-banner";
import { ProgressCircle } from "../../../seed-design/ui/progress-circle";
import { SelectRoot, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "../../../seed-design/ui/select";
import { Slider } from "../../../seed-design/ui/slider";
import { SegmentedControl, SegmentedControlItem } from "../../../seed-design/ui/segmented-control";
import { Switch } from "../../../seed-design/ui/switch";
import { TextField, TextFieldInput, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { api, brandMediaUrl, watchJob, watchJobs, type EngineJob } from "../api";
import type { SystemStatus } from "../types";
import { DEFAULT_SCRIPT_PROMPT, SCRIPT_PROMPT_MAX_LENGTH } from "../../core/script-prompt";
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from "../../core/schema";
import { BrandPreview } from "../settings/BrandPreview";
import { AppInfo } from "../UpdateControls";
import type { UpdateSnapshot } from "../updater";

type ModelStatus = {
  bgeM3: { available: boolean; ranking: "embedding" | "rules" };
  whisper: { available: boolean; sizeBytes: number };
};

type CodexModel = { slug: string; displayName: string; efforts: string[] };
type CodexModelCatalog = { source: "codex-cli" | "fallback"; models: CodexModel[] };
type ScriptPromptSettings = { prompt: string; isDefault: boolean; rulesPreview: string };
type ScriptVoiceField = "tone" | "persona";
type ScriptVoiceSettings = Record<ScriptVoiceField, string>;
type IntroSfxSetting = { enabled: boolean; ref: string; atSec: number; title: string; durationSec: number };
const DEFAULT_SCRIPT_VOICE: ScriptVoiceSettings = { tone: "", persona: "" };
type ImageOptions = { model: "flare" | "sunburst"; quality: "low" | "medium" | "high" | "auto"; aspect: "4:5" | "1:1" | "9:16" | "16:9"; concurrency: number };

export function Settings(props: { onSnackbar: (message: string) => void; onError: (message: string) => void; update: UpdateSnapshot | null; onCheckUpdate: () => void }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [jevStatus, setJevStatus] = useState<SystemStatus["jev"] | null>(null);
  const [jevKey, setJevKey] = useState("");
  const [jevChanging, setJevChanging] = useState<"save" | "delete" | null>(null);
  const [jevWarning, setJevWarning] = useState<string | null>(null);
  const [models, setModels] = useState<ModelStatus | null>(null);
  const [codexCatalog, setCodexCatalog] = useState<CodexModelCatalog>({ source: "fallback", models: [] });
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codexSettings, setCodexSettings] = useState({ model: "gpt-6-luna", effort: "medium" });
  const [scriptPrompt, setScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);
  const [savedScriptPrompt, setSavedScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);
  const [scriptPromptLoading, setScriptPromptLoading] = useState(true);
  const [scriptPromptSaving, setScriptPromptSaving] = useState(false);
  const [scriptVoice, setScriptVoice] = useState<ScriptVoiceSettings>(DEFAULT_SCRIPT_VOICE);
  const [savedScriptVoice, setSavedScriptVoice] = useState<ScriptVoiceSettings>(DEFAULT_SCRIPT_VOICE);
  const [scriptVoiceLoading, setScriptVoiceLoading] = useState(true);
  const [scriptVoiceSaving, setScriptVoiceSaving] = useState<Partial<Record<ScriptVoiceField, boolean>>>({});
  const [imageOptions, setImageOptions] = useState<ImageOptions>({ model: "flare", quality: "auto", aspect: "4:5", concurrency: 3 });
  const [introSfx, setIntroSfx] = useState<IntroSfxSetting>({ enabled: true, ref: "", atSec: 3, title: "띠링- 소리", durationSec: 1.5 });
  const [notifyItems, setNotifyItems] = useState<Array<{ ref: string; title: string; url: string }>>([]);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [savedBrand, setSavedBrand] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState<Partial<Record<keyof BrandSettings, boolean>>>({});
  const [titleImageUrl, setTitleImageUrl] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  useEffect(() => {
    void api<IntroSfxSetting>("GET", "/api/system/intro-sfx").then(setIntroSfx).catch(() => undefined);
    void api<Array<{ ref: string; title: string; url: string; category: string }>>("GET", "/api/library/sfx").then(items => setNotifyItems(items.filter(item => item.category === "notify"))).catch(() => undefined);
  }, []);
  async function saveIntroSfx(next: IntroSfxSetting) {
    setIntroSfx(next);
    try { setIntroSfx(await api<IntroSfxSetting>("PUT", "/api/system/intro-sfx", { enabled: next.enabled, ref: next.ref, atSec: next.atSec })); }
    catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        api<SystemStatus>("GET", "/api/system").then(setStatus),
        api<SystemStatus["jev"]>("GET", "/api/system/jev").then(setJevStatus),
        api<ModelStatus>("GET", "/api/models").then(setModels),
        api<typeof codexSettings>("GET", "/api/system/codex-settings").then(setCodexSettings),
        api<ImageOptions>("GET", "/api/system/image-options").then(setImageOptions),
        api<BrandSettings>("GET", "/api/system/brand").then(async value => {
          setBrand(value);
          setSavedBrand(value);
          setWatermarkUrl(value.watermark?.file ? await brandMediaUrl(value.watermark.file) : null);
          setTitleImageUrl(value.titleBar.file ? await brandMediaUrl(value.titleBar.file) : null);
        }),
        api<CodexModelCatalog>("GET", "/api/system/codex-models").then(setCodexCatalog),
        api<ScriptPromptSettings>("GET", "/api/system/script-prompt").then(value => {
          setScriptPrompt(value.prompt);
          setSavedScriptPrompt(value.prompt);
        }),
        api<ScriptVoiceSettings>("GET", "/api/system/script-voice").then(value => {
          setScriptVoice(value);
          setSavedScriptVoice(value);
        }),
      ]);
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
      setScriptPromptLoading(false);
      setScriptVoiceLoading(false);
      setBrandLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function changeJevKey(action: "save" | "delete") {
    if (jevChanging || (action === "save" && !jevKey.trim())) return;
    setJevChanging(action);
    setJevWarning(null);
    try {
      const saved = await api<SystemStatus["jev"] & { warning?: string }>(action === "save" ? "PUT" : "DELETE", "/api/system/jev-key", action === "save" ? { key: jevKey } : undefined);
      setJevKey("");
      setJevStatus(saved);
      setJevWarning(saved.warning ?? null);
      props.onSnackbar(action === "save" ? "Jev 키를 저장했어요." : "Jev 키를 지웠어요.");
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    } finally { setJevChanging(null); }
  }

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
      props.onSnackbar("대본 프롬프트를 저장했어요");
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setScriptPromptSaving(false);
    }
  }

  async function saveScriptVoiceField(field: ScriptVoiceField, value = scriptVoice[field]) {
    const next = { ...scriptVoice, [field]: value };
    setScriptVoiceSaving(current => ({ ...current, [field]: true }));
    try {
      const saved = await api<ScriptVoiceSettings>("PUT", "/api/system/script-voice", next);
      setScriptVoice(saved);
      setSavedScriptVoice(saved);
      props.onSnackbar(`${scriptVoiceLabel(field)} 설정을 저장했어요`);
    } catch (reason) {
      props.onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setScriptVoiceSaving(current => ({ ...current, [field]: false }));
    }
  }

  function resetScriptVoiceField(field: ScriptVoiceField) {
    const value = "";
    setScriptVoice(current => ({ ...current, [field]: value }));
    void saveScriptVoiceField(field, value);
  }

  async function updateImageOptions(value: ImageOptions) {
    setImageOptions(value);
    try { const saved = await api<ImageOptions>("PUT", "/api/system/image-options", value); setImageOptions(saved); }
    catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function saveBrand(layer: keyof BrandSettings) {
    const draft = brand[layer];
    setBrandSaving(current => ({ ...current, [layer]: true }));
    try {
      const current = await api<BrandSettings>("GET", "/api/system/brand");
      const saved = await api<BrandSettings>("PUT", "/api/system/brand", { ...current, [layer]: draft });
      setBrand(value => ({ ...value, [layer]: saved[layer] }));
      setSavedBrand(saved);
      props.onSnackbar(layer === "watermark" ? "워터마크를 저장했어요." : "타이틀 바를 저장했어요.");
    } catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBrandSaving(current => ({ ...current, [layer]: false })); }
  }

  async function chooseWatermark() {
    try {
      const selected = await open({ multiple: false, directory: false, title: "워터마크 이미지 선택", filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp"] }] });
      if (typeof selected !== "string") return;
      const uploaded = await api<BrandSettings & { file: string }>("POST", "/api/system/brand/watermark", { path: selected });
      const { file: _file, ...saved } = uploaded;
      setBrand(current => ({ ...current, watermark: saved.watermark }));
      setSavedBrand(saved);
      setWatermarkUrl(saved.watermark?.file ? await brandMediaUrl(saved.watermark.file) : null);
      props.onSnackbar("워터마크를 저장했어요.");
    } catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function deleteWatermark() {
    try {
      const saved = await api<BrandSettings>("DELETE", "/api/system/brand/watermark");
      setBrand(current => ({ ...current, watermark: saved.watermark }));
      setSavedBrand(saved);
      setWatermarkUrl(null);
    } catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function chooseTitleImage() {
    try {
      const selected = await open({ multiple: false, directory: false, title: "타이틀 이미지 선택", filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp"] }] });
      if (typeof selected !== "string") return;
      const uploaded = await api<BrandSettings & { file: string }>("POST", "/api/system/brand/title-image", { path: selected });
      const { file: _file, ...saved } = uploaded;
      setBrand(current => ({ ...current, titleBar: { ...current.titleBar, kind: "image", file: saved.titleBar.file } }));
      setSavedBrand(saved);
      setTitleImageUrl(saved.titleBar.file ? await brandMediaUrl(saved.titleBar.file) : null);
      props.onSnackbar("타이틀 이미지를 저장했어요.");
    } catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function deleteTitleImage() {
    try {
      const saved = await api<BrandSettings>("DELETE", "/api/system/brand/title-image");
      setBrand(current => { const { file: _file, ...titleBar } = current.titleBar; return { ...current, titleBar }; });
      setSavedBrand(saved);
      setTitleImageUrl(null);
    } catch (reason) { props.onError(reason instanceof Error ? reason.message : String(reason)); }
  }

  const setBrandField = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) => setBrand(current => ({ ...current, [key]: value }));

  return (
    <section className="screen" aria-labelledby="settings-title">
      <header className="screen-header"><div><h1 id="settings-title" className="screen-title">설정</h1></div></header>
      {error ? <div className="page-banner-wrap"><PageBanner tone="warning" variant="weak" description={error} /></div> : null}
      <div className="settings-grid">
        <div className="settings-columns">
          <div className="settings-column settings-column-a">
            <section className="section-card settings-card" aria-labelledby="watermark-title">
              <h2 id="watermark-title" className="settings-section-title">워터마크</h2>
              <BrandPreview layer="watermark" brand={brand} watermarkUrl={watermarkUrl} />
              <div className="brand-settings-watermark">
                <div className="brand-watermark-preview">{watermarkUrl ? <img src={watermarkUrl} alt="워터마크 미리보기" /> : <span>워터마크 없음</span>}</div>
                <div className="brand-watermark-actions"><ActionButton variant="neutralWeak" disabled={brandLoading} onClick={() => void chooseWatermark()}>이미지 선택</ActionButton>{brand.watermark?.file ? <ActionButton variant="ghost" onClick={() => void deleteWatermark()}>지우기</ActionButton> : null}</div>
              </div>
              <div className="settings-model-fields brand-fields">
                <BrandNumber label="기본 가로 위치" min={0} max={100} step={1} value={Math.round((brand.watermark?.x ?? 0.5) * 100)} suffix="%" onChange={value => setBrandField("watermark", { x: value / 100, y: brand.watermark?.y ?? 0.08, width: brand.watermark?.width ?? 0.2, opacity: brand.watermark?.opacity ?? 1, ...(brand.watermark?.file ? { file: brand.watermark.file } : {}) })} />
                <BrandNumber label="기본 세로 위치" min={0} max={100} step={1} value={Math.round((brand.watermark?.y ?? 0.08) * 100)} suffix="%" onChange={value => setBrandField("watermark", { x: brand.watermark?.x ?? 0.5, y: value / 100, width: brand.watermark?.width ?? 0.2, opacity: brand.watermark?.opacity ?? 1, ...(brand.watermark?.file ? { file: brand.watermark.file } : {}) })} />
                <BrandNumber label="기본 폭" min={1} max={100} step={1} value={Math.round((brand.watermark?.width ?? 0.2) * 100)} suffix="%" onChange={value => setBrandField("watermark", { x: brand.watermark?.x ?? 0.5, y: brand.watermark?.y ?? 0.08, width: value / 100, opacity: brand.watermark?.opacity ?? 1, ...(brand.watermark?.file ? { file: brand.watermark.file } : {}) })} />
                <BrandNumber label="기본 투명도" min={0} max={100} step={1} value={Math.round((brand.watermark?.opacity ?? 1) * 100)} suffix="%" onChange={value => setBrandField("watermark", { x: brand.watermark?.x ?? 0.5, y: brand.watermark?.y ?? 0.08, width: brand.watermark?.width ?? 0.2, opacity: value / 100, ...(brand.watermark?.file ? { file: brand.watermark.file } : {}) })} />
              </div>
              <div className="action-row settings-actions"><ActionButton variant="brandSolid" disabled={brandLoading || Boolean(brandSaving.watermark) || JSON.stringify(brand.watermark) === JSON.stringify(savedBrand.watermark)} loading={Boolean(brandSaving.watermark)} onClick={() => void saveBrand("watermark")}>저장</ActionButton></div>
            </section>
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
            <section className="section-card settings-card" aria-labelledby="jev-title">
              <div className="settings-card-heading"><h2 id="jev-title">Jev 짤 판정</h2><span role="status" className={`status-label ${jevStatus?.hasKey ? "is-ready" : "is-warning"}`}>{jevStatus ? jevStatus.hasKey ? "연결됨" : "키 없음" : "확인 중"}</span></div>
              <form className="jev-key-form" onSubmit={event => { event.preventDefault(); void changeJevKey("save"); }}>
                <TextField label="Jev API 키" value={jevKey} onValueChange={({ value }) => setJevKey(value)}>
                  <TextFieldInput type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={4000} disabled={!jevStatus || jevChanging !== null} placeholder={jevStatus?.hasKey ? `저장됨 ····${jevStatus.keyHint ?? ""}` : "Jev API 키를 입력하세요"} />
                </TextField>
                {jevStatus && !jevStatus.hasKey ? <p className="jev-key-guide">키가 없으면 짤은 규칙 점수로 골라요</p> : null}
                {jevWarning ? <div className="page-banner-wrap"><PageBanner tone="warning" variant="weak" description={jevWarning} /></div> : null}
                <div className="jev-key-actions">
                  <ActionButton type="button" variant="neutralWeak" disabled={!jevStatus?.hasKey || jevChanging !== null} loading={jevChanging === "delete"} onClick={() => void changeJevKey("delete")}>지우기</ActionButton>
                  <ActionButton type="submit" variant="brandSolid" disabled={!jevStatus || !jevKey.trim() || jevChanging !== null} loading={jevChanging === "save"}>저장</ActionButton>
                </div>
              </form>
            </section>
            <section className="section-card" aria-labelledby="models-title">
              <h2 id="models-title" className="settings-section-title">모델</h2>
              <div className="model-row"><div><h3>짤 검색 모델</h3><p>{bgeJob ? "받는 동안 짤은 기본 순위로 골라요." : models?.bgeM3.available ? "짤을 검색할 때 사용해요." : "받기 전에는 짤을 기본 순위로 골라요."}</p></div>
                {bgeJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={bgeJob.progress === null ? undefined : bgeJob.progress * 100} /><span>{bgeJob.message ?? "받는 중"}{bgeJob.progress === null ? "" : ` · ${Math.round(bgeJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(bgeJob.id)}>취소</ActionButton></div> : models?.bgeM3.available ? <span className="model-ready">준비됨</span> : <ActionButton variant="neutralWeak" onClick={() => void download("bge-m3")}>받기</ActionButton>}
              </div>
              <div className="model-row"><div><h3>받아 적기 모델</h3><p>자막 만들기와 AI 추천 대본에 써요. · 574 MB</p></div>
                {whisperJob ? <div className="model-progress"><ProgressCircle size="24" tone="brand" value={whisperJob.progress === null ? undefined : whisperJob.progress * 100} /><span>{whisperJob.message ?? "받는 중"}{whisperJob.progress === null ? "" : ` · ${Math.round(whisperJob.progress * 100)}%`}</span><ActionButton variant="neutralWeak" size="small" onClick={() => void cancel(whisperJob.id)}>취소</ActionButton></div> : <ActionButton variant="neutralWeak" disabled={models?.whisper.available} onClick={() => void download("whisper")}>{models?.whisper.available ? "받음" : "받기"}</ActionButton>}
              </div>
            </section>
          </div>
          <div className="settings-column settings-column-b">
            <section className="section-card settings-card" aria-labelledby="title-bar-title">
              <h2 id="title-bar-title" className="settings-section-title">타이틀 바</h2>
              <BrandPreview layer="titleBar" brand={brand} titleImageUrl={titleImageUrl} />
              <SegmentedControl aria-label="타이틀 내용 종류" value={brand.titleBar.kind} onValueChange={kind => setBrandField("titleBar", { ...brand.titleBar, kind: kind as "text" | "image" })}>
                <SegmentedControlItem value="text">글</SegmentedControlItem><SegmentedControlItem value="image">이미지</SegmentedControlItem>
              </SegmentedControl>
              {brand.titleBar.kind === "text" ? <TextField label="기본 글" value={brand.titleBar.text} onValueChange={({ value }) => setBrandField("titleBar", { ...brand.titleBar, text: value.slice(0, 30) })}><TextFieldInput maxLength={30} disabled={brandLoading} /></TextField> : <div className="brand-settings-watermark">
                <div className="brand-watermark-preview">{titleImageUrl ? <img src={titleImageUrl} alt="타이틀 이미지 미리보기" /> : <span>타이틀 이미지 없음</span>}</div>
                <div className="brand-watermark-actions"><ActionButton variant="neutralWeak" disabled={brandLoading} onClick={() => void chooseTitleImage()}>이미지 선택</ActionButton>{brand.titleBar.file ? <ActionButton variant="ghost" onClick={() => void deleteTitleImage()}>지우기</ActionButton> : null}</div>
              </div>}
              <div className="settings-model-fields brand-fields">
                <BrandNumber label="타이틀 바 높이" min={40} max={600} step={1} value={brand.titleBar.height} suffix="px" onChange={value => setBrandField("titleBar", { ...brand.titleBar, height: value })} />
                <BrandColor label="배경 색" value={brand.titleBar.bgColor} onChange={bgColor => setBrandField("titleBar", { ...brand.titleBar, bgColor })} />
                <BrandNumber label="배경 투명도" min={0} max={100} step={1} value={Math.round(brand.titleBar.bgOpacity * 100)} suffix="%" onChange={value => setBrandField("titleBar", { ...brand.titleBar, bgOpacity: value / 100 })} />
                <ModelSelect label="폰트" value={brand.titleBar.font} items={[{ value: "pretendard", label: "Pretendard" }, { value: "gmarket", label: "G마켓 산스" }, { value: "tmon", label: "티몬체" }]} onChange={font => setBrandField("titleBar", { ...brand.titleBar, font: font as BrandSettings["titleBar"]["font"] })} />
                <BrandNumber label="글자 크기" min={12} max={200} step={1} value={brand.titleBar.fontSize} suffix="px" onChange={value => setBrandField("titleBar", { ...brand.titleBar, fontSize: value })} />
                <BrandColor label="글자 색" value={brand.titleBar.color} onChange={color => setBrandField("titleBar", { ...brand.titleBar, color })} />
              </div>
              <div className="action-row settings-actions"><ActionButton variant="brandSolid" disabled={brandLoading || Boolean(brandSaving.titleBar) || JSON.stringify(brand.titleBar) === JSON.stringify(savedBrand.titleBar)} loading={Boolean(brandSaving.titleBar)} onClick={() => void saveBrand("titleBar")}>저장</ActionButton></div>
            </section>
          </div>
          <div className="settings-column settings-column-c">
            <section className="section-card settings-card" aria-labelledby="image-options-title">
              <h2 id="image-options-title" className="settings-section-title">이미지 생성</h2>
              <div className="settings-model-fields">
                <ModelSelect label="이미지 모델" value={imageOptions.model} items={[{ value: "flare", label: "Flare · 빠름" }, { value: "sunburst", label: "Sunburst · 고품질" }]} onChange={model => void updateImageOptions({ ...imageOptions, model: model as ImageOptions["model"] })} />
                <ModelSelect label="퀄리티" value={imageOptions.quality} items={["low", "medium", "high", "auto"].map(value => ({ value, label: value }))} onChange={quality => void updateImageOptions({ ...imageOptions, quality: quality as ImageOptions["quality"] })} />
                <ModelSelect label="비율" value={imageOptions.aspect} items={[{ value: "4:5", label: "4:5" }, { value: "1:1", label: "1:1" }, { value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" }]} onChange={aspect => void updateImageOptions({ ...imageOptions, aspect: aspect as ImageOptions["aspect"] })} />
              </div>
              <div className="image-concurrency"><Slider label={`동시 실행 수 · ${imageOptions.concurrency}`} min={1} max={10} step={1} values={[imageOptions.concurrency]} onValuesChange={values => { const concurrency = values[0]; if (typeof concurrency === "number") void updateImageOptions({ ...imageOptions, concurrency }); }} /></div>
            </section>
            <section className="section-card settings-card intro-sfx-card" aria-labelledby="intro-sfx-title">
              <h2 id="intro-sfx-title" className="settings-section-title">자동 알림음</h2>
              <Switch label="자동 알림음 켜기" checked={introSfx.enabled} onCheckedChange={enabled => void saveIntroSfx({ ...introSfx, enabled })} />
              <ModelSelect label="알림음" value={introSfx.ref} items={notifyItems.map(item => ({ value: item.ref, label: item.title }))} onChange={ref => { const item = notifyItems.find(candidate => candidate.ref === ref); if (item) void saveIntroSfx({ ...introSfx, ref: item.ref, title: item.title }); }} />
              <div className="intro-sfx-actions"><ActionButton variant="neutralWeak" disabled={!notifyItems.find(item => item.ref === introSfx.ref)} onClick={() => { const item = notifyItems.find(candidate => candidate.ref === introSfx.ref); if (item) new Audio(item.url).play().catch(() => undefined); }}>미리 듣기</ActionButton></div>
              <div className="intro-sfx-slider"><Slider label="알림음 시각" indicator={`${introSfx.atSec.toFixed(1)}초`} min={0} max={10} step={0.1} values={[introSfx.atSec]} onValuesChange={values => { const atSec = values[0]; if (typeof atSec === "number") setIntroSfx(value => ({ ...value, atSec })); }} onValuesCommit={values => { const atSec = values[0]; if (typeof atSec === "number") void saveIntroSfx({ ...introSfx, atSec }); }} /></div>
            </section>
            <AppInfo status={props.update} onCheck={props.onCheckUpdate} />
          </div>
        </div>
        <section className="section-card settings-card script-prompt-card" aria-labelledby="script-prompt-title">
          <h2 id="script-prompt-title" className="settings-section-title">대본 프롬프트</h2>
          <TextField
            label="기본 지시문"
            description="대본을 만들 때마다 적용할 지시문이에요."
            maxGraphemeCount={SCRIPT_PROMPT_MAX_LENGTH}
            value={scriptPrompt}
            onValueChange={({ value }) => setScriptPrompt(value)}
          >
            <TextFieldTextarea
              className="script-prompt-input"
              maxLength={SCRIPT_PROMPT_MAX_LENGTH}
              disabled={scriptPromptLoading || scriptPromptSaving}
            />
          </TextField>
          <div className="action-row settings-actions">
            <ActionButton variant="neutralWeak" disabled={scriptPromptLoading || scriptPromptSaving || scriptPrompt === DEFAULT_SCRIPT_PROMPT} onClick={() => setScriptPrompt(DEFAULT_SCRIPT_PROMPT)}>기본값으로 되돌리기</ActionButton>
            <ActionButton variant="brandSolid" disabled={scriptPromptLoading || scriptPromptSaving || scriptPrompt === savedScriptPrompt} loading={scriptPromptSaving} onClick={() => void saveScriptPrompt()}>저장</ActionButton>
          </div>
          <div className="script-voice-fields">
            {(["tone", "persona"] as const).map(field => <div className={`script-voice-field script-voice-field-${field}`} key={field}>
              <TextField
                label={scriptVoiceLabel(field)}
                description="비워 두면 언어집에서 AI가 선택해요."
                maxGraphemeCount={4000}
                value={scriptVoice[field]}
                onValueChange={({ value }) => setScriptVoice(current => ({ ...current, [field]: value }))}
              >
                <TextFieldTextarea className="script-voice-input" maxLength={4000} disabled={scriptVoiceLoading || Boolean(scriptVoiceSaving[field])} />
              </TextField>
              <div className="action-row settings-actions">
                <ActionButton variant="neutralWeak" disabled={scriptVoiceLoading || Boolean(scriptVoiceSaving[field]) || scriptVoice[field] === ""} onClick={() => resetScriptVoiceField(field)}>기본값으로 되돌리기</ActionButton>
                <ActionButton variant="brandSolid" disabled={scriptVoiceLoading || Boolean(scriptVoiceSaving[field]) || scriptVoice[field] === savedScriptVoice[field]} loading={Boolean(scriptVoiceSaving[field])} onClick={() => void saveScriptVoiceField(field)}>저장</ActionButton>
              </div>
            </div>)}
          </div>
        </section>
      </div>
    </section>
  );
}

function scriptVoiceLabel(field: ScriptVoiceField): string {
  return ({ tone: "말투", persona: "성격" })[field];
}

function ModelSelect(props: { label: string; value: string; items: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <SelectRoot value={[props.value]} onValueChange={value => { if (value[0]) props.onChange(value[0]); }} label={props.label} size="medium">
    <SelectTrigger aria-label={props.label} />
    <SelectContent><SelectGroup>{props.items.map(item => <SelectItem key={item.value} value={item.value} label={item.label} />)}</SelectGroup></SelectContent>
  </SelectRoot>;
}

function BrandNumber(props: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="brand-number"><Slider label={props.label} indicator={`${props.value}${props.suffix}`} min={props.min} max={props.max} step={props.step} values={[props.value]} getAriaLabel={() => props.label} onValuesChange={values => { const value = values[0]; if (typeof value === "number") props.onChange(value); }} /></div>;
}

function BrandColor(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField label={props.label} value={props.value} onValueChange={({ value }) => props.onChange(value)}><TextFieldInput maxLength={7} placeholder="#RRGGBB" /></TextField>;
}
