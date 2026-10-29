import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Player } from "@remotion/player";
import type { Carousel, CarouselLogo, CarouselSlide as Slide } from "../../../core/carousel";
import { visibleBackground } from "../../../core/carousel";
import { videoDuration } from "../../../core/timeline/ops";
import { CarouselSlide } from "../../../remotion/CarouselSlide";
import { carouselCanvasSize, carouselHighlightInput } from "../../../remotion/carousel-layout";
import { api } from "../../api";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { PropertyRow } from "../../components/u3/PropertyRow";
import { PropertySection } from "../../components/u3/PropertySection";
import { BackgroundSection, HighlightSection } from "./BackgroundSection";
import { CarouselImage, useCarouselFile } from "./CarouselImage";
import { CarouselTextInspector } from "./CarouselTextInspector";
import { CarouselTextLayer } from "./CarouselTextLayer";
import { HighlightLayer } from "./HighlightLayer";
import { CarouselOverflowMeasure, CarouselOverflowNotice, useOverflowMap } from "./CarouselOverflow";
import { Choice, RangeRow, TextBlock } from "../../components/u3/CarouselControls";
import { canDownloadSlides, defaultHighlightBox, derivedFrameDuration, highlightRequestBody } from "./derived-ui-state";
import { useCarouselDraft } from "./useCarouselDraft";
import { useCarouselSource } from "./useCarouselSource";
import { errorMessage, slideImage, slideStatus, statusLabel } from "./workflow";
import type { WorkspaceProps } from "./CarouselReview";

type Frame = Extract<Slide["background"], { kind: "frame" }>;
type Highlight = NonNullable<Frame["highlight"]>;

export function CarouselEdit(props: WorkspaceProps) {
  const editor = useCarouselDraft(props.carousel, props.onUpdate);
  const { draft } = editor;
  const [selectedId, setSelectedId] = useState(draft.slides[0]?.id ?? "");
  const [textId, setTextId] = useState<string | null>(draft.slides[0]?.texts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [brandAvailable, setBrandAvailable] = useState(false);
  const [logoDefaults, setLogoDefaults] = useState<Pick<CarouselLogo, "x" | "y" | "width" | "opacity"> | null>(null);
  const overflow = useOverflowMap();
  const current = draft.slides.find(slide => slide.id === selectedId) ?? draft.slides[0];
  const frame = current?.background.kind === "frame" ? current.background : null;
  const source = useCarouselSource(draft.source);
  const sourceDuration = draft.source.kind === "project" ? derivedFrameDuration(draft.source.durationSec, source.project ? videoDuration(source.project.timeline) : undefined, draft.slides) : 0;
  const imageUrl = useCarouselFile(draft.id, current ? slideImage(current)?.file : undefined);
  const backgroundError = current ? visibleBackground(current).error : undefined;
  const logoUrl = useCarouselFile(draft.id, current?.logo?.file);
  const canvas = carouselCanvasSize(draft.aspect);
  const base = `/api/carousels/${encodeURIComponent(draft.id)}`;
  const selectedBase = `${base}/slides/${encodeURIComponent(current?.id ?? "")}`;
  const working = props.jobs.some(job => job.projectId === draft.id && ["queued", "running"].includes(job.status)) || draft.slides.some(slide => ["queued", "running"].includes(slideStatus(slide)));
  const slideWorking = current && ["queued", "running"].includes(slideStatus(current));
  const completeCount = draft.slides.filter(slide => slideStatus(slide) === "done" && slideImage(slide)).length;
  const overflowCount = Object.keys(overflow.map).length;
  const run = (work: () => Promise<unknown>) => { void work().catch(e => props.onError(errorMessage(e))); };
  useEffect(() => {
    let live = true;
    void api<{ watermark?: Pick<CarouselLogo, "x" | "y" | "width" | "opacity"> & { file?: string } }>("GET", "/api/system/brand").then(brand => {
      if (!live) return;
      setBrandAvailable(Boolean(brand.watermark?.file));
      if (brand.watermark) { const { x, y, width, opacity } = brand.watermark; setLogoDefaults({ x, y, width, opacity }); }
    }).catch(e => { if (live) props.onError(errorMessage(e)); });
    return () => { live = false; };
  }, []);
  async function operation(work: () => Promise<Carousel>) {
    setBusy(true); try { return await editor.mutate(work); } finally { setBusy(false); }
  }
  async function saveHighlight(patch: Partial<Highlight>, createAi = false) {
    if (!current || !frame) return;
    const latest = editor.getSlide(current.id)?.background;
    const highlight: Highlight = { style: "none", target: "", ...(latest?.kind === "frame" ? latest.highlight : frame.highlight), ...patch };
    await operation(async () => {
      if (highlight.style === "ai-outline" && !createAi) return api<Carousel>("PATCH", selectedBase, { background: { highlight: { style: highlight.style, target: highlight.target, ...(highlight.box ? { box: highlight.box } : {}) } } });
      const result = await api<Carousel | { job: unknown }>("POST", `${selectedBase}/highlight`, highlightRequestBody(highlight));
      if ("slides" in result) return result;
      props.onSnackbar("AI 윤곽을 만들기 시작했어요");
      return api<Carousel>("GET", base);
    });
  }
  async function logoEnabled(enabled: boolean) {
    if (!current) return;
    setBusy(true);
    try {
      const archived = current.logo ?? draft.slides.find(slide => slide.logo)?.logo;
      const logo = archived ? { ...archived, ...(!current.logo && logoDefaults ? logoDefaults : {}), enabled } : await api<CarouselLogo>("POST", `${base}/logo`, {});
      editor.changeSlide(current.id, { logo }); await editor.saveSlide(current.id);
    } finally { setBusy(false); }
  }
  function changeLogo(patch: Partial<CarouselLogo>, commit = false) {
    if (!current?.logo) return;
    editor.changeSlide(current.id, { logo: { ...current.logo, ...patch } });
    if (commit) run(() => editor.saveSlide(current.id));
  }
  async function regenerate() {
    await operation(async () => {
      if (frame?.mode === "ai") await api("POST", `${selectedBase}/regenerate`, {});
      else await api("POST", `${base}/generate`, { slideIds: [current!.id] });
      return api<Carousel>("GET", base);
    });
  }
  async function changeMode(mode: "ai" | "frame") {
    await operation(async () => {
      await api("PATCH", selectedBase, { background: { mode } });
      return api<Carousel>("GET", base);
    });
  }
  async function reextract() {
    if (!frame) return;
    await operation(async () => {
      await api("POST", `${selectedBase}/frame`, { sec: frame.sec, cropY: frame.cropY });
      return api<Carousel>("GET", base);
    });
  }
  async function download(skipIncomplete: boolean) {
    setConfirmDownload(false); setDownloading(true);
    try {
      await editor.flush();
      const dir = isTauri() ? await open({ title: "캐러셀을 저장할 폴더 선택", directory: true, multiple: false }) : null;
      if (typeof dir !== "string") return;
      const result = await api<{ directory: string }>("POST", `${base}/download`, { dir, skipIncomplete });
      props.onSnackbar(`받았어요: ${result.directory}`);
    } finally { setDownloading(false); }
  }
  return <section className="flex h-dvh min-h-0 min-w-0 flex-col gap-4 p-6" aria-label={`${draft.name} 편집`}>
    <header className="flex min-w-0 items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="sm" onClick={() => run(async () => { await editor.flush(); props.onBack(); })}>캐러셀 목록</Button><h1 className="truncate text-xl font-bold">{draft.name}</h1></div><div className="flex shrink-0 gap-2">{working && <Button variant="outline" disabled={busy} onClick={() => run(() => operation(async () => { await api("POST", `${base}/cancel`, {}); props.onSnackbar("캐러셀 생성을 취소했어요"); return api<Carousel>("GET", base); }))}>전체 취소</Button>}<Button disabled={downloading || !canDownloadSlides(draft.slides)} onClick={() => { if (completeCount < draft.slides.length || overflowCount) setConfirmDownload(true); else run(() => download(false)); }}>{downloading ? "받는 중" : "모두 받기"}</Button></div></header>
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[200px_minmax(0,1fr)_340px] gap-4">
      <aside className="flex min-h-0 flex-col gap-1.5 overflow-y-auto" aria-label="캐러셀 장 목록">{draft.slides.map((slide, index) => <button type="button" key={slide.id} aria-pressed={current?.id === slide.id} className={`flex min-w-0 items-center gap-2.5 rounded-lg border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${current?.id === slide.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent"}`} onClick={() => run(async () => { await editor.flush(); setSelectedId(slide.id); setTextId(slide.texts[0]!.id); })}><span className="grid h-8 w-14 shrink-0 place-items-center overflow-hidden rounded bg-muted">{slideImage(slide) && <CarouselImage carouselId={draft.id} file={slideImage(slide)!.file} />}</span><span className="flex min-w-0 flex-col text-xs"><strong>{index + 1}장</strong><span className={slideStatus(slide) === "failed" || slide.error === "지시문 없음" ? "text-destructive" : "text-muted-foreground"}>{statusLabel(slide)}</span>{overflow.map[slide.id]?.length > 0 && <span className="text-[11px] text-destructive">넘침</span>}</span></button>)}</aside>
      <main className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-card p-4">
        {current && <>
          <div className="relative min-h-0 w-full max-w-[512px]" style={{ aspectRatio: `${canvas.width} / ${canvas.height}`, maxHeight: "100%", width: `min(100%, calc((100dvh - 220px) * ${canvas.width / canvas.height}))` }}>
            <div className="carousel-player absolute inset-0 overflow-hidden rounded bg-muted shadow-lg"><Player component={CarouselSlide} inputProps={{ imageUrl, texts: current.texts, logo: current.logo, logoUrl, brightness: current.brightness, shade: current.shade, aspect: draft.aspect, frameCropY: frame?.mode === "ai" ? undefined : frame?.cropY, highlight: carouselHighlightInput(frame?.highlight) }} durationInFrames={1} fps={30} compositionWidth={canvas.width} compositionHeight={canvas.height} controls={false} clickToPlay={false} doubleClickToFullscreen={false} style={{ width: "100%", height: "100%" }} /></div>
            {frame?.highlight?.box && frame.highlight.style !== "none" && <HighlightLayer box={frame.highlight.box} selected={textId === null} onSelect={() => setTextId(null)} onChange={(box, commit) => { editor.changeSlide(current.id, { background: { highlight: { box } } }); if (commit) run(() => saveHighlight({ box })); }} />}
            <CarouselTextLayer texts={current.texts} aspect={draft.aspect} selectedId={textId} overflow={overflow.map[current.id] ?? []} onSelect={setTextId} onChange={(text, commit) => { editor.changeSlide(current.id, { texts: current.texts.map(t => t.id === text.id ? text : t) }); if (commit) run(() => editor.saveSlide(current.id)); }} />
          </div>
          <p className="text-xs text-muted-foreground">{draft.aspect} · {draft.slides.indexOf(current) + 1} / {draft.slides.length}장</p>
          <CarouselOverflowNotice count={overflowCount} />
        </>}
      </main>
      <aside className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-3" aria-label="장 편집">{current && <>
        <CarouselTextInspector texts={current.texts} selectedId={textId ?? current.texts[0]!.id} onSelect={setTextId} onChange={texts => editor.changeSlide(current.id, { texts })} onCommit={() => run(() => editor.saveSlide(current.id))} />
        <section className="border-t border-border pt-3 pb-2" aria-label="로고"><PropertyRow label="로고"><Switch aria-label="로고" checked={current.logo?.enabled ?? false} disabled={busy || (!brandAvailable && !current.logo)} onCheckedChange={enabled => run(() => logoEnabled(enabled))} /></PropertyRow>
          {!brandAvailable && !current.logo && (props.onSettings ? <Button variant="link" size="sm" className="px-0 text-xs" onClick={() => run(async () => { await editor.flush(); props.onSettings!(); })}>설정에서 이미지 선택</Button> : <p className="my-1 text-xs text-muted-foreground">설정에서 이미지 선택</p>)}
          {current.logo?.enabled && <>
            <PropertyRow label="위치"><Choice label="로고 위치" value={`${current.logo.x < 0.5 ? "left" : "right"}-${current.logo.y < 0.5 ? "top" : "bottom"}`} options={[["left-top", "왼쪽 위"], ["right-top", "오른쪽 위"], ["left-bottom", "왼쪽 아래"], ["right-bottom", "오른쪽 아래"]]} onChange={value => changeLogo({ x: value.startsWith("left") ? 0.1 : 0.9, y: value.endsWith("top") ? 0.1 : 0.9 }, true)} /></PropertyRow>
            {([["x", "가로 위치"], ["y", "세로 위치"], ["width", "폭"], ["opacity", "투명도"]] as const).map(([key, label]) => <RangeRow key={key} label={`로고 ${label}`} value={current.logo![key] * 100} onChange={value => changeLogo({ [key]: value / 100 })} onCommit={() => run(() => editor.saveSlide(current.id))} />)}
          </>}
        </section>
        <PropertySection title="배경">
          <RangeRow label="밝기" value={current.brightness * 100} min={20} max={200} onChange={value => editor.changeSlide(current.id, { brightness: value / 100 })} onCommit={() => run(() => editor.saveSlide(current.id))} />
          <RangeRow label="음영" value={current.shade * 100} max={90} onChange={value => editor.changeSlide(current.id, { shade: value / 100 })} onCommit={() => run(() => editor.saveSlide(current.id))} />
          {frame ? <BackgroundSection frame={frame} duration={sourceDuration} sourceAvailable={Boolean(source.project)} busy={busy || Boolean(slideWorking)} onChange={background => editor.changeSlide(current.id, { background })} onCommit={() => run(() => editor.saveSlide(current.id))} onReextract={() => run(reextract)} onRegenerate={() => run(regenerate)} onModeChange={mode => run(() => changeMode(mode))} /> : <>
            <TextBlock label="이미지 지시문" className="min-h-35" value={current.imagePrompt} maxLength={4000} onChange={e => editor.changeSlide(current.id, { imagePrompt: e.target.value })} onBlur={() => run(() => editor.saveSlide(current.id))} />
            <Button variant="solid" className="my-2 w-full" disabled={!current.imagePrompt.trim() || busy || Boolean(slideWorking)} onClick={() => run(regenerate)}>다시 만들기</Button>
          </>}
          {backgroundError && <p role="alert" className="my-1 text-xs text-destructive">{backgroundError}</p>}
          {slideWorking && <p role="status" className="my-1 text-xs text-muted-foreground">{slideStatus(current) === "queued" ? "대기 중" : "생성 중"}</p>}
        </PropertySection>
        {frame && <HighlightSection frame={frame} busy={busy || Boolean(slideWorking)} onChange={(patch, commit) => { if (patch.style) run(() => saveHighlight(patch)); else { editor.changeSlide(current.id, { background: { highlight: patch } }); if (commit) run(() => saveHighlight(patch)); } }} onCommit={() => run(() => saveHighlight({}))} onAiCreate={() => run(() => saveHighlight({ style: "ai-outline" }, true))} onDrawBox={() => run(() => saveHighlight({ box: defaultHighlightBox() }))} />}
        <PropertySection title="캡션"><TextBlock showLabel={false} label="게시 캡션" value={draft.caption} maxLength={2000} onChange={e => editor.changeFields({ caption: e.target.value })} onBlur={() => run(editor.saveFields)} /></PropertySection>
      </>}</aside>
    </div>
    <CarouselOverflowMeasure slides={draft.slides} aspect={draft.aspect} onMeasure={overflow.update} />
    <AlertDialog open={confirmDownload} onOpenChange={setConfirmDownload}><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>완료한 장 {completeCount}개만 받을까요?</AlertDialogTitle><CarouselOverflowNotice count={overflowCount} /><AlertDialogFooter><Button variant="outline" onClick={() => setConfirmDownload(false)}>취소</Button><Button variant="solid" onClick={() => run(() => download(true))}>완료한 장 받기</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
