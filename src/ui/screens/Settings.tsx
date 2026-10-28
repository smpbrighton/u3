import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, PlayIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { api, brandMediaUrl, watchJob, watchJobs, type EngineJob } from "../api";
import type { SystemStatus } from "../types";
import { DEFAULT_SCRIPT_PROMPT, SCRIPT_PROMPT_MAX_LENGTH } from "../../core/script-prompt";
import { CAROUSEL_PROMPT_MAX_LENGTH, DEFAULT_CAROUSEL_TOPIC_PROMPT, DEFAULT_CAROUSEL_VIDEO_PROMPT } from "../../core/carousel-prompt";
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from "../../core/schema";
import { DEFAULT_TTS_SETTINGS, TTS_SPEAKERS } from "../../core/tts-clips";
import { BrandPreview } from "../settings/BrandPreview";
import { SettingsSaves } from "../settings/settings-save";
import { ThemeSettings } from "../settings/ThemeSettings";
import { ShortcutSettings } from "../settings/ShortcutSettings";
import { ModelDownloadRow } from "../settings/ModelDownloadRow";
import { SettingRow, SettingsGroup, SettingsSelect, SettingsChoice, SettingsSlider, SettingsColor, SettingsIconButton } from "../settings/SettingsControls";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { Alert } from "../components/ui/alert";
import { cn } from "../components/ui/utils";
import { AppInfo } from "../UpdateControls";
import type { UpdateSnapshot } from "../updater";
import { useBeforeUpdateRestart } from "../update-save";
import type { StudioShortcutTable } from "../../core/studio-shortcuts";
import { resolveCodexModel } from "../../core/codex-model";
import { codexWarningMessage } from "../components/u3/CodexWarning";

type ModelStatus = {
  bgeM3: { available: boolean; ranking: "embedding" | "rules" };
  whisper: { available: boolean; sizeBytes: number };
  qwenTts: { available: boolean; sizeBytes: number };
};

type CodexModel = { slug: string; displayName: string; efforts: string[] };
type CodexModelCatalog = { source: "codex-cli" | "fallback"; models: CodexModel[] };
type ScriptPromptSettings = { prompt: string; isDefault: boolean; rulesPreview: string };
type CarouselPromptKind = "topic" | "video";
type CarouselPromptSettings = Record<CarouselPromptKind, { prompt: string; isDefault: boolean }>;
const DEFAULT_CAROUSEL_PROMPTS: Record<CarouselPromptKind, string> = { topic: DEFAULT_CAROUSEL_TOPIC_PROMPT, video: DEFAULT_CAROUSEL_VIDEO_PROMPT };
type ScriptVoiceField = "tone" | "persona";
type ScriptVoiceSettings = Record<ScriptVoiceField, string>;
type IntroSfxSetting = { enabled: boolean; ref: string; atSec: number; title: string; durationSec: number };
const DEFAULT_SCRIPT_VOICE: ScriptVoiceSettings = { tone: "", persona: "" };
type ImageOptions = { model: "flare" | "sunburst"; quality: "low" | "medium" | "high" | "auto"; aspect: "4:5" | "1:1" | "9:16" | "16:9"; concurrency: number };

const SECTIONS = [["screen", "화면"], ["shortcuts", "단축키"], ["brand", "브랜드"], ["script", "대본"], ["meme", "짤"], ["voice", "음성"], ["imagegen", "이미지 생성"], ["sound", "알림음"], ["about", "앱 정보"]] as const;
type SettingsSection = typeof SECTIONS[number][0];

export function Settings(props: { shortcuts?: StudioShortcutTable; onShortcuts?: (bindings: StudioShortcutTable) => void; onSnackbar: (message: string) => void; onError: (message: string) => void; update: UpdateSnapshot | null; onCheckUpdate: () => void }) {
  const [section, setSection] = useState<SettingsSection>("screen");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [jevStatus, setJevStatus] = useState<SystemStatus["jev"] | null>(null);
  const [jevKey, setJevKey] = useState("");
  const [jevChanging, setJevChanging] = useState(false);
  const [jevWarning, setJevWarning] = useState<string | null>(null);
  const [models, setModels] = useState<ModelStatus | null>(null);
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [startingModels, setStartingModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [codexChecking, setCodexChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codexCatalog, setCodexCatalog] = useState<CodexModelCatalog>({ source: "fallback", models: [] });
  const [codexSettings, setCodexSettings] = useState({ model: resolveCodexModel(undefined, []), effort: "medium" });
  const codexRef = useRef(codexSettings);
  const [ttsSettings, setTtsSettings] = useState(DEFAULT_TTS_SETTINGS);
  const ttsRef = useRef(ttsSettings);
  const [imageOptions, setImageOptions] = useState<ImageOptions>({ model: "flare", quality: "auto", aspect: "4:5", concurrency: 3 });
  const imageRef = useRef(imageOptions);
  const [carouselPrompts, setCarouselPrompts] = useState(DEFAULT_CAROUSEL_PROMPTS);
  const carouselPromptsRef = useRef(carouselPrompts);
  const [introSfx, setIntroSfx] = useState<IntroSfxSetting>({ enabled: true, ref: "", atSec: 3, title: "띠링- 소리", durationSec: 1.5 });
  const introRef = useRef(introSfx);
  const [notifyItems, setNotifyItems] = useState<Array<{ ref: string; title: string; url: string }>>([]);
  const [scriptPrompt, setScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);
  const promptRef = useRef(scriptPrompt);
  const [scriptVoice, setScriptVoice] = useState<ScriptVoiceSettings>(DEFAULT_SCRIPT_VOICE);
  const voiceRef = useRef(scriptVoice);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const brandRef = useRef(brand);
  const [assetChanging, setAssetChanging] = useState(false);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [titleImageUrl, setTitleImageUrl] = useState<string | null>(null);
  const saves = useRef(new SettingsSaves()).current;
  useBeforeUpdateRestart(() => saves.flush());

  const fail = useCallback((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    setError(message);
    props.onError(message);
  }, [props.onError]);

  // 설정 API가 같은 파일을 갱신하므로 구역별 저장 요청을 순서대로 실행한다.
  function persist<T,>(resource: string, operation: () => Promise<T>): Promise<T | undefined> {
    return saves.run(resource, operation).then(value => { setError(null); return value; }).catch(reason => { fail(reason); return undefined; });
  }

  useEffect(() => {
    void (async () => {
      const results = await Promise.allSettled([
        api<SystemStatus>("GET", "/api/system").then(setStatus),
        api<SystemStatus["jev"]>("GET", "/api/system/jev").then(setJevStatus),
        api<ModelStatus>("GET", "/api/models").then(setModels),
        api<typeof ttsSettings>("GET", "/api/system/tts-settings").then(value => { ttsRef.current = value; setTtsSettings(value); }),
        api<typeof codexSettings>("GET", "/api/system/codex-settings").then(value => { codexRef.current = value; setCodexSettings(value); }),
        api<ImageOptions>("GET", "/api/system/image-options").then(value => { imageRef.current = value; setImageOptions(value); }),
        api<CarouselPromptSettings>("GET", "/api/system/carousel-prompts").then(value => {
          const next = { topic: value.topic.prompt, video: value.video.prompt };
          carouselPromptsRef.current = next; setCarouselPrompts(next);
        }),
        api<IntroSfxSetting>("GET", "/api/system/intro-sfx").then(value => { introRef.current = value; setIntroSfx(value); }),
        api<Array<{ ref: string; title: string; url: string; category: string }>>("GET", "/api/library/sfx").then(items => setNotifyItems(items.filter(item => item.category === "notify"))),
        api<BrandSettings>("GET", "/api/system/brand").then(async value => {
          brandRef.current = value; setBrand(value);
          setWatermarkUrl(value.watermark?.file ? await brandMediaUrl(value.watermark.file) : null);
          setTitleImageUrl(value.titleBar.file ? await brandMediaUrl(value.titleBar.file) : null);
        }),
        api<CodexModelCatalog>("GET", "/api/system/codex-models").then(setCodexCatalog),
        api<ScriptPromptSettings>("GET", "/api/system/script-prompt").then(value => { promptRef.current = value.prompt; setScriptPrompt(value.prompt); }),
        api<ScriptVoiceSettings>("GET", "/api/system/script-voice").then(value => { voiceRef.current = value; setScriptVoice(value); }),
      ]);
      const rejected = results.find(result => result.status === "rejected");
      if (rejected?.status === "rejected") fail(rejected.reason);
      setLoading(false);
    })();
  }, [fail]);

  useEffect(() => {
    const controller = new AbortController();
    void watchJobs(received => setJobs(current => {
      const next = new Map(current.map(job => [job.id, job]));
      for (const job of received) if (job.kind === "models") next.set(job.id, job);
      return [...next.values()].filter(job => ["queued", "running"].includes(job.status));
    }), controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function refreshCodex() {
    setCodexChecking(true);
    try {
      const results = await Promise.allSettled([
        api<SystemStatus>("GET", "/api/system").then(setStatus),
        api<CodexModelCatalog>("GET", "/api/system/codex-models").then(setCodexCatalog),
        api<typeof codexSettings>("GET", "/api/system/codex-settings").then(value => { codexRef.current = value; setCodexSettings(value); }),
      ]);
      const rejected = results.find(result => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      setError(null);
    } catch (reason) { fail(reason); }
    finally { setCodexChecking(false); }
  }

  async function chooseCodexPath() {
    try {
      const selected = await open({ multiple: false, directory: false, title: "codex 실행 파일 선택" });
      if (typeof selected !== "string") return;
      await persist("codex-path", async () => { await api("PUT", "/api/system/codex-path", { path: selected }); await refreshCodex(); });
    } catch (reason) { fail(reason); }
  }

  async function changeJevKey(action: "save" | "delete") {
    if (jevChanging || (action === "save" && !jevKey.trim())) return;
    setJevChanging(true); setJevWarning(null);
    await persist("jev-key", async () => {
      const saved = await api<SystemStatus["jev"] & { warning?: string }>(action === "save" ? "PUT" : "DELETE", "/api/system/jev-key", action === "save" ? { key: jevKey } : undefined);
      setJevKey(""); setJevStatus(saved); setJevWarning(saved.warning ?? null);
    });
    setJevChanging(false);
  }

  async function download(model: "bge-m3" | "whisper" | "qwen-tts") {
    if (startingModels.includes(model)) return;
    setStartingModels(current => [...current, model]);
    try {
      const job = await api<EngineJob>("POST", "/api/models/download", { model });
      setJobs(current => [...current.filter(item => item.id !== job.id), job]);
      const controller = new AbortController();
      const final = await watchJob(job.id, update => setJobs(current => [...current.filter(item => item.id !== update.id), update]), controller.signal);
      if (final.status === "failed") throw new Error(final.error ?? "모델을 받지 못했어요.");
      setModels(await api<ModelStatus>("GET", "/api/models"));
      setJobs(current => current.filter(item => item.id !== job.id));
    } catch (reason) { fail(reason); }
    finally { setStartingModels(current => current.filter(item => item !== model)); }
  }

  async function cancel(jobId: string) {
    try { await api("DELETE", `/api/jobs/${jobId}`); setJobs(current => current.filter(job => job.id !== jobId)); }
    catch (reason) { fail(reason); }
  }
  const modelJob = (name: string) => jobs.find(job => job.label?.toLowerCase().includes(name) && ["queued", "running"].includes(job.status));

  function updateCodex(next: typeof codexSettings) {
    codexRef.current = next; setCodexSettings(next);
    void persist("codex-settings", () => api("PUT", "/api/system/codex-settings", next));
  }
  function updateTts(next: typeof ttsSettings) {
    ttsRef.current = next; setTtsSettings(next);
    void persist("tts-settings", () => api("PUT", "/api/system/tts-settings", next));
  }
  function updateImage(next: ImageOptions) {
    imageRef.current = next; setImageOptions(next);
    void persist("image-options", () => api("PUT", "/api/system/image-options", next));
  }
  function updateIntro(next: IntroSfxSetting) {
    introRef.current = next; setIntroSfx(next);
    void persist("intro-sfx", () => api("PUT", "/api/system/intro-sfx", { enabled: next.enabled, ref: next.ref, atSec: next.atSec }));
  }

  function changePrompt(value: string) { promptRef.current = value; setScriptPrompt(value); }
  function savePrompt(value = promptRef.current) {
    void persist("script-prompt", async () => {
      const saved = await api<ScriptPromptSettings>("PUT", "/api/system/script-prompt", { prompt: value });
      if (promptRef.current === value) changePrompt(saved.prompt);
    });
  }
  function changeVoice(field: ScriptVoiceField, value: string) {
    voiceRef.current = { ...voiceRef.current, [field]: value }; setScriptVoice(voiceRef.current);
  }
  function saveVoice() {
    const next = { ...voiceRef.current };
    void persist("script-voice", async () => { await api<ScriptVoiceSettings>("PUT", "/api/system/script-voice", next); });
  }
  function changeCarouselPrompt(kind: CarouselPromptKind, value: string) {
    carouselPromptsRef.current = { ...carouselPromptsRef.current, [kind]: value };
    setCarouselPrompts(carouselPromptsRef.current);
  }
  function saveCarouselPrompt(kind: CarouselPromptKind) {
    const value = carouselPromptsRef.current[kind];
    void persist("carousel-prompts", async () => {
      const saved = await api<CarouselPromptSettings>("PUT", "/api/system/carousel-prompts", { [kind]: value });
      if (carouselPromptsRef.current[kind] === value) changeCarouselPrompt(kind, saved[kind].prompt);
    });
  }

  function saveBrand(layer: keyof BrandSettings, draft: BrandSettings[keyof BrandSettings]) {
    const next = { ...brandRef.current, [layer]: draft };
    brandRef.current = next; setBrand(next);
    void persist(`brand-${layer}`, async () => {
      const current = await api<BrandSettings>("GET", "/api/system/brand");
      // 이미지 파일은 전용 API로 바꾼다. 뒤에 대기한 속성 저장은 현재 파일을 보존한다.
      const nextLayer = { ...draft, file: current[layer]?.file };
      await api("PUT", "/api/system/brand", { ...current, [layer]: nextLayer });
    });
  }
  function updateWatermark(patch: Partial<NonNullable<BrandSettings["watermark"]>>) {
    saveBrand("watermark", { ...DEFAULT_BRAND_SETTINGS.watermark!, ...brandRef.current.watermark, ...patch });
  }
  function updateTitle(patch: Partial<BrandSettings["titleBar"]>) { saveBrand("titleBar", { ...brandRef.current.titleBar, ...patch }); }

  async function changeBrandImage(layer: keyof BrandSettings, action: "choose" | "delete") {
    setAssetChanging(true);
    try {
      let selected: string | null = null;
      if (action === "choose") {
        const file = await open({ multiple: false, directory: false, title: layer === "watermark" ? "워터마크 이미지 선택" : "타이틀 이미지 선택", filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp"] }] });
        if (typeof file !== "string") return;
        selected = file;
      }
      await persist(`brand-${layer}`, async () => {
        const saved = await api<BrandSettings>(action === "choose" ? "POST" : "DELETE", `/api/system/brand/${layer === "watermark" ? "watermark" : "title-image"}`, selected ? { path: selected } : undefined);
        const next = { ...brandRef.current, [layer]: saved[layer] };
        brandRef.current = next; setBrand(next);
        const file = saved[layer]?.file;
        const url = file ? await brandMediaUrl(file) : null;
        if (layer === "watermark") setWatermarkUrl(url); else setTitleImageUrl(url);
      });
    } catch (reason) { fail(reason); }
    finally { setAssetChanging(false); }
  }

  const selectedModel = codexCatalog.models.find(model => model.slug === codexSettings.model);
  const modelOptions = selectedModel ? codexCatalog.models : [...codexCatalog.models, { slug: codexSettings.model, displayName: codexSettings.model, efforts: [] }];
  const effortOptions = selectedModel?.efforts.length ? selectedModel.efforts : ["low", "medium", "high"];
  const codexWarning = codexWarningMessage(status);
  const brandDisabled = loading || assetChanging;
  const watermark = { ...DEFAULT_BRAND_SETTINGS.watermark!, ...brand.watermark };

  return <section className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-10 py-7" aria-labelledby="settings-title">
    <header className="flex h-9 shrink-0 items-center"><h1 id="settings-title" className="text-xl font-bold">설정</h1></header>
    {error && <Alert className="flex min-h-11 shrink-0 items-center gap-2.5 [&>svg]:text-u3-danger-text">
      <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-4 shrink-0" />
      <strong className="shrink-0">설정을 저장하지 못했어요</strong><span className="truncate text-xs text-muted-foreground" title={error}>{error}</span>
    </Alert>}
    <div className="flex items-start gap-10">
      <nav aria-label="설정 구역" className="sticky top-0 flex w-[200px] shrink-0 flex-col gap-0.5 pt-1">
        {SECTIONS.map(([key, label]) => <Button key={key} id={`settings-nav-${key}`} variant="ghost" aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)} className="h-8 justify-start px-2.5 text-muted-foreground aria-[current=page]:bg-secondary aria-[current=page]:font-bold aria-[current=page]:text-foreground">{label}</Button>)}
      </nav>
      <div role="region" aria-labelledby={`settings-nav-${section}`} className={cn("flex min-w-0 flex-1 flex-col gap-6", section === "brand" ? "max-w-[960px]" : "max-w-[640px]")}>
        {section === "screen" && <ThemeSettings />}
        {section === "shortcuts" && <ShortcutSettings shortcuts={props.shortcuts} onShortcuts={props.onShortcuts} saves={saves} />}

        {section === "brand" && <>
          <div className="flex items-start gap-8">
            <div className="min-w-0 flex-1"><SettingsGroup title="워터마크">
              <SettingRow label="이미지" value={<span className="inline-flex gap-1.5"><Button variant="outline" size="sm" disabled={brandDisabled} onClick={() => void changeBrandImage("watermark", "choose")}>선택</Button>{brand.watermark?.file && <Button variant="ghost" size="sm" disabled={brandDisabled} onClick={() => void changeBrandImage("watermark", "delete")}>지우기</Button>}</span>}>
                <span className="truncate text-xs text-muted-foreground">{brand.watermark?.file ?? "없음"}</span>
              </SettingRow>
              <SettingsSlider label="가로 위치" value={Math.round(watermark.x * 100)} min={0} max={100} suffix="%" disabled={brandDisabled} onChange={value => updateWatermark({ x: value / 100 })} />
              <SettingsSlider label="세로 위치" value={Math.round(watermark.y * 100)} min={0} max={100} suffix="%" disabled={brandDisabled} onChange={value => updateWatermark({ y: value / 100 })} />
              <SettingsSlider label="폭" value={Math.round(watermark.width * 100)} min={1} max={100} suffix="%" disabled={brandDisabled} onChange={value => updateWatermark({ width: value / 100 })} />
              <SettingsSlider label="투명도" value={Math.round(watermark.opacity * 100)} min={0} max={100} suffix="%" disabled={brandDisabled} onChange={value => updateWatermark({ opacity: value / 100 })} />
            </SettingsGroup></div>
            <BrandPreview layer="watermark" brand={brand} watermarkUrl={watermarkUrl} />
          </div>
          <div className="flex items-start gap-8">
            <div className="min-w-0 flex-1"><SettingsGroup title="타이틀 바">
              <SettingRow label="종류"><SettingsChoice label="타이틀 내용 종류" value={brand.titleBar.kind} items={[{ value: "text", label: "글" }, { value: "image", label: "이미지" }]} disabled={brandDisabled} onChange={kind => updateTitle({ kind: kind as "text" | "image" })} /></SettingRow>
              {brand.titleBar.kind === "text"
                ? <SettingRow label="기본 글" htmlFor="brand-title-text" value={`${brand.titleBar.text.length}/30`}><Input id="brand-title-text" maxLength={30} className="h-7 text-xs" disabled={brandDisabled} value={brand.titleBar.text} onChange={event => updateTitle({ text: event.target.value.slice(0, 30) })} /></SettingRow>
                : <SettingRow label="이미지" value={<span className="inline-flex gap-1.5"><Button variant="outline" size="sm" disabled={brandDisabled} onClick={() => void changeBrandImage("titleBar", "choose")}>선택</Button>{brand.titleBar.file && <Button variant="ghost" size="sm" disabled={brandDisabled} onClick={() => void changeBrandImage("titleBar", "delete")}>지우기</Button>}</span>}><span className="truncate text-xs text-muted-foreground">{brand.titleBar.file ?? "없음"}</span></SettingRow>}
              <SettingsSlider label="높이" value={brand.titleBar.height} min={40} max={600} suffix="px" disabled={brandDisabled} onChange={height => updateTitle({ height })} />
              <SettingsColor label="배경 색" value={brand.titleBar.bgColor} disabled={brandDisabled} onChange={bgColor => updateTitle({ bgColor })} />
              <SettingsSlider label="배경 투명도" value={Math.round(brand.titleBar.bgOpacity * 100)} min={0} max={100} suffix="%" disabled={brandDisabled} onChange={value => updateTitle({ bgOpacity: value / 100 })} />
              <SettingRow label="폰트"><SettingsSelect label="폰트" value={brand.titleBar.font} items={[{ value: "pretendard", label: "Pretendard" }, { value: "gmarket", label: "G마켓 산스" }, { value: "tmon", label: "티몬체" }]} disabled={brandDisabled} onChange={font => updateTitle({ font: font as BrandSettings["titleBar"]["font"] })} /></SettingRow>
              <SettingsSlider label="글자 크기" value={brand.titleBar.fontSize} min={12} max={200} suffix="px" disabled={brandDisabled} onChange={fontSize => updateTitle({ fontSize })} />
              <SettingsColor label="글자 색" value={brand.titleBar.color} disabled={brandDisabled} onChange={color => updateTitle({ color })} />
            </SettingsGroup></div>
            <BrandPreview layer="titleBar" brand={brand} titleImageUrl={titleImageUrl} />
          </div>
        </>}

        {section === "script" && <>
          <SettingsGroup title="codex">
            {codexWarning && <Alert className="mb-1 flex min-h-11 items-center gap-2 [&>svg]:text-u3-danger-text">
              <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-4 shrink-0" /><strong className="min-w-0 flex-1 text-sm">{codexWarning}</strong>
              {!status?.codex.installed && <Button variant="outline" size="sm" disabled={loading || codexChecking} onClick={() => void chooseCodexPath()}>실행 파일 지정</Button>}
              <Button variant="ghost" size="sm" disabled={loading || codexChecking} aria-busy={codexChecking} onClick={() => void refreshCodex()}><HugeiconsIcon icon={RefreshIcon} aria-hidden="true" className="size-4" />다시 확인</Button>
            </Alert>}
            <SettingRow label="모델"><SettingsSelect label="codex 모델" value={codexSettings.model} items={modelOptions.map(model => ({ value: model.slug, label: model.displayName }))} disabled={loading} onChange={model => {
              const efforts = codexCatalog.models.find(item => item.slug === model)?.efforts ?? [];
              const effort = efforts.includes(codexRef.current.effort) ? codexRef.current.effort : efforts.includes("medium") ? "medium" : efforts[0] ?? "medium";
              updateCodex({ model, effort });
            }} /></SettingRow>
            <SettingRow label="추론 강도"><SettingsChoice label="추론 강도" value={codexSettings.effort} items={effortOptions.map(effort => ({ value: effort, label: effort }))} disabled={loading} onChange={effort => updateCodex({ ...codexRef.current, effort })} /></SettingRow>
            <ModelDownloadRow label="STT 모델" size="574 MB" available={Boolean(models?.whisper.available)} job={modelJob("whisper")} starting={startingModels.includes("whisper")} disabled={loading} onDownload={() => void download("whisper")} onCancel={jobId => void cancel(jobId)} />
          </SettingsGroup>
          <SettingsGroup title="대본 프롬프트" action={<Button variant="ghost" size="xs" disabled={loading || scriptPrompt === DEFAULT_SCRIPT_PROMPT} onClick={() => { changePrompt(DEFAULT_SCRIPT_PROMPT); savePrompt(DEFAULT_SCRIPT_PROMPT); }}>기본값으로</Button>}>
            <Textarea aria-label="대본 프롬프트" maxLength={SCRIPT_PROMPT_MAX_LENGTH} disabled={loading} value={scriptPrompt} onChange={event => changePrompt(event.target.value)} onBlur={() => savePrompt()} className="h-28 text-xs" />
            <span className="mt-1 text-right text-2xs text-muted-foreground tabular-nums">{scriptPrompt.length.toLocaleString("ko-KR")}/{SCRIPT_PROMPT_MAX_LENGTH.toLocaleString("ko-KR")}</span>
          </SettingsGroup>
          <div className="grid grid-cols-2 gap-4">
            {(["tone", "persona"] as const).map(field => <SettingsGroup key={field} title={field === "tone" ? "말투" : "성격"} action={<Button variant="ghost" size="xs" disabled={loading || !scriptVoice[field]} onClick={() => { changeVoice(field, ""); saveVoice(); }}>기본값으로</Button>}>
              <Textarea aria-label={field === "tone" ? "말투" : "성격"} placeholder={field === "tone" ? "친구에게 말하듯 짧은 반말" : "솔직하고 장난기 있는 20대 직장인"} maxLength={4000} disabled={loading} value={scriptVoice[field]} onChange={event => changeVoice(field, event.target.value)} onBlur={saveVoice} className="min-h-16 text-xs" />
            </SettingsGroup>)}
          </div>
        </>}

        {section === "meme" && <>
          <SettingsGroup title="Jev">
            <form onSubmit={event => { event.preventDefault(); void changeJevKey("save"); }}>
              <SettingRow label="API 키" htmlFor="jev-api-key" value={<span className="inline-flex gap-1.5"><Button type="submit" variant="solid" size="sm" disabled={loading || !jevStatus || !jevKey.trim() || jevChanging}>저장</Button><Button variant="ghost" size="sm" disabled={!jevStatus?.hasKey || jevChanging} onClick={() => void changeJevKey("delete")}>지우기</Button></span>}>
                <Input id="jev-api-key" type="password" aria-label="Jev API 키" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={4000} value={jevKey} onChange={event => setJevKey(event.target.value)} disabled={loading || !jevStatus || jevChanging} placeholder={jevStatus?.hasKey ? `•••• ${jevStatus.keyHint ?? ""}` : ""} className="h-7 text-xs tabular-nums" />
              </SettingRow>
            </form>
            {jevWarning && <Alert className="mt-2 flex items-center gap-2 [&>svg]:text-u3-danger-text"><HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-4 shrink-0" /><span className="text-xs">{jevWarning}</span></Alert>}
          </SettingsGroup>
          <SettingsGroup title="짤 검색"><ModelDownloadRow label="짤 검색 모델" available={Boolean(models?.bgeM3.available)} job={modelJob("bge-m3")} starting={startingModels.includes("bge-m3")} disabled={loading} onDownload={() => void download("bge-m3")} onCancel={jobId => void cancel(jobId)} /></SettingsGroup>
        </>}

        {section === "voice" && <SettingsGroup title="음성">
          <SettingRow label="화자"><SettingsSelect label="화자" value={ttsSettings.speaker} items={TTS_SPEAKERS.map(speaker => ({ value: speaker, label: speaker }))} disabled={loading} onChange={speaker => updateTts({ ...ttsRef.current, speaker: speaker as typeof ttsSettings.speaker })} /></SettingRow>
          <SettingRow label="말투 지시" htmlFor="tts-instruct"><Input id="tts-instruct" maxLength={4000} disabled={loading} value={ttsSettings.instruct} onChange={event => updateTts({ ...ttsRef.current, instruct: event.target.value })} className="h-7 text-xs" /></SettingRow>
          <ModelDownloadRow label="음성 만들기 모델" size="약 3.1 GB" available={Boolean(models?.qwenTts?.available)} job={modelJob("qwen-tts")} starting={startingModels.includes("qwen-tts")} disabled={loading} onDownload={() => void download("qwen-tts")} onCancel={jobId => void cancel(jobId)} />
        </SettingsGroup>}

        {section === "imagegen" && <>
          <SettingsGroup title="이미지 생성">
            <SettingRow label="모델"><SettingsChoice label="이미지 모델" value={imageOptions.model} items={[{ value: "flare", label: "Flare · 빠름" }, { value: "sunburst", label: "Sunburst · 고품질" }]} disabled={loading} onChange={model => updateImage({ ...imageRef.current, model: model as ImageOptions["model"] })} /></SettingRow>
            <SettingRow label="퀄리티"><SettingsChoice label="퀄리티" value={imageOptions.quality} items={["low", "medium", "high", "auto"].map(value => ({ value, label: value }))} disabled={loading} onChange={quality => updateImage({ ...imageRef.current, quality: quality as ImageOptions["quality"] })} /></SettingRow>
            <SettingRow label="비율"><SettingsChoice label="비율" value={imageOptions.aspect} items={["4:5", "1:1", "9:16", "16:9"].map(value => ({ value, label: value }))} disabled={loading} onChange={aspect => updateImage({ ...imageRef.current, aspect: aspect as ImageOptions["aspect"] })} /></SettingRow>
            <SettingRow label="동시 실행 수"><div className="flex h-7 items-center rounded-md border border-input bg-background">
              <SettingsIconButton label="동시 실행 수 줄이기" variant="ghost" size="icon-xs" disabled={loading || imageOptions.concurrency <= 1} onClick={() => updateImage({ ...imageRef.current, concurrency: imageRef.current.concurrency - 1 })}>−</SettingsIconButton>
              <Input aria-label="동시 실행 수" type="number" min={1} max={10} step={1} disabled={loading} value={imageOptions.concurrency} className="h-6 w-14 border-0 px-1 text-center text-xs" onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) updateImage({ ...imageRef.current, concurrency: Math.min(10, Math.max(1, Math.round(value))) }); }} />
              <SettingsIconButton label="동시 실행 수 늘리기" variant="ghost" size="icon-xs" disabled={loading || imageOptions.concurrency >= 10} onClick={() => updateImage({ ...imageRef.current, concurrency: imageRef.current.concurrency + 1 })}>+</SettingsIconButton>
            </div></SettingRow>
          </SettingsGroup>
          {([["topic", "캐러셀 기획 프롬프트 · 주제로"], ["video", "캐러셀 기획 프롬프트 · 영상으로"]] as const).map(([kind, title]) => <SettingsGroup key={kind} title={title} action={<Button variant="ghost" size="xs" disabled={loading || carouselPrompts[kind] === DEFAULT_CAROUSEL_PROMPTS[kind]} onClick={() => { changeCarouselPrompt(kind, DEFAULT_CAROUSEL_PROMPTS[kind]); saveCarouselPrompt(kind); }}>기본값으로</Button>}>
            <Textarea aria-label={title} maxLength={CAROUSEL_PROMPT_MAX_LENGTH} disabled={loading} value={carouselPrompts[kind]} onChange={event => changeCarouselPrompt(kind, event.target.value)} onBlur={() => saveCarouselPrompt(kind)} className="h-28 text-xs" />
            <span className="mt-1 text-right text-2xs text-muted-foreground tabular-nums">{carouselPrompts[kind].length.toLocaleString("ko-KR")}/{CAROUSEL_PROMPT_MAX_LENGTH.toLocaleString("ko-KR")}</span>
          </SettingsGroup>)}
        </>}

        {section === "sound" && <SettingsGroup title="알림음">
          <SettingRow label="켜기" htmlFor="intro-sfx-enabled"><Switch id="intro-sfx-enabled" checked={introSfx.enabled} disabled={loading} onCheckedChange={enabled => updateIntro({ ...introRef.current, enabled })} /></SettingRow>
          <SettingRow label="소리"><SettingsSelect label="소리" value={introSfx.ref} items={notifyItems.map(item => ({ value: item.ref, label: item.title }))} disabled={loading} onChange={ref => { const item = notifyItems.find(candidate => candidate.ref === ref); if (item) updateIntro({ ...introRef.current, ref: item.ref, title: item.title }); }} />
            <SettingsIconButton label="미리 듣기" disabled={!notifyItems.some(item => item.ref === introSfx.ref)} onClick={() => { const item = notifyItems.find(candidate => candidate.ref === introSfx.ref); if (item) void new Audio(item.url).play().catch(fail); }}><HugeiconsIcon icon={PlayIcon} aria-hidden="true" className="size-4" /></SettingsIconButton>
          </SettingRow>
          <SettingsSlider label="재생 시작 딜레이" value={introSfx.atSec} min={0} max={10} step={0.1} suffix="초" disabled={loading} onChange={atSec => updateIntro({ ...introRef.current, atSec })} />
        </SettingsGroup>}
        {section === "about" && <AppInfo status={props.update} onCheck={props.onCheckUpdate} />}
      </div>
    </div>
  </section>;
}
