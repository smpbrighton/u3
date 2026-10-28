import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useBeforeUpdateRestart } from "../update-save";
import { open } from "@tauri-apps/plugin-dialog";
import { Player } from "@remotion/player";
import type { Carousel, CarouselSlide as Slide } from "../../core/carousel";
import { CarouselSlide } from "../../remotion/CarouselSlide";
import { carouselCanvasSize } from "../../remotion/carousel-layout";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { DialogRoot, DialogContent, DialogBody, DialogFooter } from "../../../seed-design/ui/dialog";
import { AlertDialogRoot, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "../../../seed-design/ui/alert-dialog";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "../../../seed-design/ui/menu";
import { TextField, TextFieldInput, TextFieldTextarea } from "../../../seed-design/ui/text-field";
import { SegmentedControl, SegmentedControlItem } from "../../../seed-design/ui/segmented-control";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@seed-design/react";
import { api, carouselFileUrl, watchJobs } from "../api";
import { PreviewEditLayer, type PreviewEditTarget } from "../studio/PreviewEditLayer";
import { canDownloadSlides, canReextractFrame, defaultHighlightBox, derivedFrameDuration, highlightRequestBody, showsBackgroundSection } from "./carousel/derived-ui-state";
import { BackgroundSection } from "./carousel/BackgroundSection";

type Candidate = { topic: string; angle: string };
type Job = { projectId: string | null; kind: string; sceneIndex?: number | null; status: string };

export function Carousels(props: { initialCarousel?: Carousel | null; onSnackbar: (message: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<Carousel[]>([]);
  const [active, setActive] = useState<Carousel | null>(props.initialCarousel ?? null);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [refining, setRefining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<Carousel | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Carousel | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const reload = async () => setItems(await api<Carousel[]>("GET", "/api/carousels"));
  useEffect(() => { void reload().catch(error => props.onError(message(error))); }, []);
  useEffect(() => { setActive(props.initialCarousel ?? null); }, [props.initialCarousel?.id]);
  useEffect(() => {
    const controller = new AbortController();
    void watchJobs(received => {
      const relevant = received.filter(job => job.kind === "image");
      setJobs(current => [...current.filter(job => !relevant.some(next => next.projectId === job.projectId && next.sceneIndex === job.sceneIndex)), ...relevant].filter(job => ["queued", "running"].includes(job.status)));
      if (active) void refreshActive(active.id);
    }, controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [active?.id]);

  async function refreshActive(id: string) {
    try { setActive(await api<Carousel>("GET", `/api/carousels/${encodeURIComponent(id)}`)); }
    catch (error) { props.onError(message(error)); }
  }
  async function refine() {
    if (!topic.trim()) return;
    setRefining(true);
    try { const result = await api<{ candidates: Candidate[] }>("POST", "/api/carousels/refine", { topic }); setCandidates(result.candidates); setSelected(0); }
    catch (error) { props.onError(message(error)); }
    finally { setRefining(false); }
  }
  async function create() {
    const chosenTopic = selected === null ? topic.trim() : (candidates[selected]?.topic ?? topic.trim());
    if (!chosenTopic) return;
    setBusy(true);
    try {
      const value = await api<Carousel>("POST", "/api/carousels", { topic: chosenTopic, slideCount: count });
      setCreating(false); setCandidates([]); setSelected(null); setActive(value);
      const planned = await api<Carousel>("POST", `/api/carousels/${value.id}/plan`, { topic: chosenTopic });
      setActive(planned);
      const result = await api<{ jobs: unknown[] }>("POST", `/api/carousels/${value.id}/generate`, {});
      props.onSnackbar("캐러셀을 만들기 시작했어요.");
      if (!result.jobs.length) props.onSnackbar("캐러셀 기획을 마쳤어요.");
      await reload(); await refreshActive(value.id);
    } catch (error) { props.onError(message(error)); }
    finally { setBusy(false); }
  }
  async function saveName() {
    if (!rename || !name.trim()) return;
    try { const updated = await api<Carousel>("PUT", `/api/carousels/${rename.id}`, { name: name.trim() }); setItems(current => current.map(item => item.id === updated.id ? updated : item)); setRename(null); }
    catch (error) { props.onError(message(error)); }
  }
  async function remove() {
    if (!deleting) return;
    try { await api("DELETE", `/api/carousels/${deleting.id}`); setItems(current => current.filter(item => item.id !== deleting.id)); setDeleting(null); }
    catch (error) { props.onError(message(error)); }
  }

  if (active) return <CarouselWorkspace carousel={active} jobs={jobs} onBack={() => { setActive(null); void reload(); }} onUpdate={setActive} onSnackbar={props.onSnackbar} onError={props.onError} />;

  return <section className="screen carousel-screen" aria-labelledby="carousel-title">
    <header className="screen-header"><div><h1 id="carousel-title" className="screen-title">캐러셀</h1><p className="screen-subtitle">사진과 글로 넘겨 보는 게시물을 만들어요.</p></div><ActionButton variant="brandSolid" onClick={() => { setCreating(true); setTopic(""); setCount(5); }}>새 캐러셀</ActionButton></header>
    {items.length ? <div className="project-grid" aria-label="캐러셀 목록">{items.map(item => <div className="project-card" key={item.id}>
      <button type="button" className="project-card-open" aria-label={`${item.name} 열기`} onClick={() => void refreshActive(item.id)}>
        <span className="project-thumb carousel-card-thumb" style={{ aspectRatio: `${carouselCanvasSize(item.aspect).width} / ${carouselCanvasSize(item.aspect).height}` }}>{item.slides.find(slide => slideImage(slide)) ? <CarouselImage carouselId={item.id} file={slideImage(item.slides.find(slide => slideImage(slide))!)!.file} /> : <span>{item.slides.length}장</span>}</span>
        <span className="project-card-body"><span className="project-name">{item.name}{item.source.kind === "project" ? <span className="carousel-source-badge">영상에서</span> : null}</span><span className="project-meta">{item.slides.length}장 · {item.slides.filter(slide => slideStatus(slide) === "done").length}장 완료</span></span>
      </button>
      <div className="project-menu-wrap"><MenuRoot><MenuTrigger asChild><ActionButton layout="iconOnly" variant="neutralWeak" aria-label={`${item.name} 메뉴`}><Icon svg={<HugeiconsIcon icon={MoreHorizontalIcon} size={20} />} /></ActionButton></MenuTrigger><MenuContent>
        <MenuItem label="이름 바꾸기" onClick={() => { setRename(item); setName(item.name); }} /><MenuItem label="삭제" onClick={() => setDeleting(item)} />
      </MenuContent></MenuRoot></div>
    </div>)}</div> : <div className="empty-state"><div><p>아직 캐러셀이 없어요.</p><ActionButton variant="neutralWeak" onClick={() => setCreating(true)}>새 캐러셀</ActionButton></div></div>}
    <DialogRoot open={creating} onOpenChange={open => { if (!open) setCreating(false); }}><DialogContent title="새 캐러셀" description="주제와 장 수를 정해 주세요." showCloseButton>
      <DialogBody><div className="carousel-create-fields"><TextField label="주제" value={topic} maxGraphemeCount={1000} onValueChange={({ value }) => { setTopic(value); setSelected(null); }}><TextFieldTextarea maxLength={1000} placeholder="예: 혼자 여행할 때 좋은 서울의 작은 서점" /></TextField>
        <label className="carousel-count">장 수 <select aria-label="장 수" value={count} onChange={event => setCount(Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => index + 2).map(value => <option key={value} value={value}>{value}장</option>)}</select></label>
        <ActionButton variant="neutralWeak" disabled={!topic.trim() || refining} loading={refining} onClick={() => void refine()}>AI 로 다듬기</ActionButton>
        {candidates.length ? <div className="carousel-candidates" role="radiogroup" aria-label="다듬은 주제 후보">{candidates.map((candidate, index) => <button type="button" key={index} role="radio" aria-checked={selected === index} className="carousel-candidate" onClick={() => { setSelected(index); setTopic(candidate.topic); }}><strong>{candidate.topic}</strong><span>{candidate.angle}</span></button>)}</div> : null}
      </div></DialogBody><DialogFooter><ActionButton variant="neutralWeak" onClick={() => setCreating(false)}>취소</ActionButton><ActionButton variant="brandSolid" disabled={!topic.trim() || busy} loading={busy} onClick={() => void create()}>만들기</ActionButton></DialogFooter>
    </DialogContent></DialogRoot>
    <DialogRoot open={Boolean(rename)} onOpenChange={open => { if (!open) setRename(null); }}><DialogContent title="캐러셀 이름 바꾸기" description="새 이름을 입력해 주세요." showCloseButton={false}><DialogBody><TextField aria-label="캐러셀 이름" value={name} onValueChange={({ value }) => setName(value)}><TextFieldInput maxLength={120} /></TextField></DialogBody><DialogFooter><ActionButton variant="neutralWeak" onClick={() => setRename(null)}>취소</ActionButton><ActionButton variant="brandSolid" disabled={!name.trim()} onClick={() => void saveName()}>저장</ActionButton></DialogFooter></DialogContent></DialogRoot>
    <AlertDialogRoot open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{deleting?.name}’ 캐러셀을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>캐러셀과 생성한 이미지가 삭제됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><ActionButton variant="neutralWeak" onClick={() => setDeleting(null)}>취소</ActionButton><AlertDialogAction asChild><ActionButton variant="criticalSolid" onClick={() => void remove()}>삭제</ActionButton></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialogRoot>
  </section>;
}

function CarouselWorkspace(props: { carousel: Carousel; jobs: Job[]; onBack: () => void; onUpdate: (carousel: Carousel) => void; onSnackbar: (message: string) => void; onError: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(props.carousel.slides[0]?.id ?? "");
  const [edited, setEdited] = useState<Slide | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const slide = props.carousel.slides.find(item => item.id === selectedId) ?? props.carousel.slides[0];
  const current = edited?.id === slide?.id ? edited : slide;
  const [imageUrl, setImageUrl] = useState("");
  const [sourceAvailable, setSourceAvailable] = useState(props.carousel.source.kind !== "project");
  const [sourceDuration, setSourceDuration] = useState(props.carousel.source.kind === "project" ? derivedFrameDuration(props.carousel.source.durationSec, undefined, props.carousel.slides) : 0);
  const [boxSelected, setBoxSelected] = useState(true);
  const [highlightChoice, setHighlightChoice] = useState<"none" | "border" | "dim" | "zoom" | "ai-outline">("border");
  const size = carouselCanvasSize(props.carousel.aspect);
  const unfinished = props.carousel.slides.some(item => slideStatus(item) !== "done" || !slideImage(item));
  const selectedJob = props.jobs.find(job => job.projectId === props.carousel.id && job.sceneIndex === props.carousel.slides.findIndex(item => item.id === slide?.id));

  useBeforeUpdateRestart(async () => {
    if (!current || !slide || !edited) return;
    const updated = await api<Carousel>("PATCH", `/api/carousels/${props.carousel.id}/slides/${slide.id}`, {
      texts: current.texts, imagePrompt: current.imagePrompt,
    });
    props.onUpdate(updated);
  });

  useEffect(() => { setEdited(null); }, [slide?.id, slide?.texts, slide?.imagePrompt, slide?.background]);
  useEffect(() => { setHighlightChoice(slide?.background.kind === "frame" ? slide.background.highlight?.style ?? "border" : "border"); }, [slide?.id, slide?.background]);
  useEffect(() => {
    let live = true;
    const source = props.carousel.source;
    if (source.kind !== "project") { setSourceAvailable(false); return; }
    void api<{ timeline: { video: Array<{ durationSec?: number; inStartSec?: number; inEndSec?: number }> } }>("GET", `/api/projects/${encodeURIComponent(source.projectId)}`)
      .then(project => { if (!live) return; setSourceAvailable(true); setSourceDuration(derivedFrameDuration(source.durationSec, project.timeline.video.reduce((sum, clip) => sum + (clip.durationSec ?? Math.max(0, (clip.inEndSec ?? 0) - (clip.inStartSec ?? 0))), 0), props.carousel.slides)); })
      .catch(() => { if (live) { setSourceAvailable(false); setSourceDuration(derivedFrameDuration(source.durationSec, undefined, props.carousel.slides)); } });
    return () => { live = false; };
  }, [props.carousel.source, props.carousel.slides]);
  useEffect(() => {
    let active = true;
    const image = slide?.background.kind === "frame" ? (slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame) : slide?.background.image ?? slide?.image;
    if (image) void carouselFileUrl(props.carousel.id, image.file).then(url => { if (active) setImageUrl(url); });
    else setImageUrl("");
    return () => { active = false; };
  }, [props.carousel.id, slide?.image?.file, slide?.background]);
  async function persist(fields: Partial<Pick<Slide, "texts" | "imagePrompt">>) {
    if (!slide) return;
    try { const updated = await api<Carousel>("PATCH", `/api/carousels/${props.carousel.id}/slides/${slide.id}`, fields); props.onUpdate(updated); setEdited(updated.slides.find(item => item.id === slide.id) ?? null); }
    catch (error) { props.onError(message(error)); }
  }
  async function persistFrame(fields: { sec?: number; cropY?: number }) {
    if (!slide || slide.background.kind !== "frame") return;
    try {
      const updated = await api<Carousel>("PATCH", `/api/carousels/${props.carousel.id}/slides/${slide.id}`, { background: fields });
      props.onUpdate(updated);
      setEdited(updated.slides.find(item => item.id === slide.id) ?? null);
    } catch (error) { props.onError(message(error)); }
  }
  async function saveHighlight(patch: { style?: "none" | "border" | "dim" | "zoom" | "ai-outline"; target?: string; box?: import("../../core/carousel").CarouselBox; color?: string; width?: number }) {
    if (!slide || slide.background.kind !== "frame") return;
    const highlight = { ...slide.background.highlight, ...patch, style: patch.style ?? slide.background.highlight?.style ?? "border", target: patch.target ?? slide.background.highlight?.target ?? "" };
    try {
      const result = await api<Carousel | { job: unknown }>("POST", `/api/carousels/${props.carousel.id}/slides/${slide.id}/highlight`, highlightRequestBody(highlight));
      if ("slides" in result) props.onUpdate(result);
      else props.onSnackbar("AI 윤곽을 만들기 시작했어요.");
    } catch (error) { props.onError(message(error)); }
  }
  async function reextractFrame() {
    if (!slide || slide.background.kind !== "frame" || !canReextractFrame(slide.background, sourceAvailable)) return;
    try { props.onUpdate(await api<Carousel>("POST", `/api/carousels/${props.carousel.id}/slides/${slide.id}/frame`, { sec: current?.background.kind === "frame" ? current.background.sec : slide.background.sec, cropY: slide.background.cropY })); }
    catch (error) { props.onError(message(error)); }
  }
  async function regenerate() {
    if (!slide) return;
    try { await persist({ imagePrompt: current?.imagePrompt ?? "" }); await api("POST", `/api/carousels/${props.carousel.id}/generate`, { slideIds: [slide.id] }); }
    catch (error) { props.onError(message(error)); }
  }
  async function cancelAll() {
    try { await api("POST", `/api/carousels/${props.carousel.id}/cancel`, {}); props.onSnackbar("캐러셀 생성을 취소했어요."); }
    catch (error) { props.onError(message(error)); }
  }
  async function download(skipIncomplete: boolean) {
    setConfirmIncomplete(false);
    setDownloading(true);
    try {
      const dir = isTauri() ? await open({ title: "캐러셀을 저장할 폴더 선택", directory: true, multiple: false }) : null;
      if (typeof dir !== "string") return;
      const result = await api<{ directory: string }>("POST", `/api/carousels/${props.carousel.id}/download`, { dir, skipIncomplete });
      props.onSnackbar(`받았어요: ${result.directory}`);
    } catch (error) { props.onError(message(error)); }
    finally { setDownloading(false); }
  }
  async function handleDownload() {
    if (unfinished) { setConfirmIncomplete(true); return; }
    await download(false);
  }

  const currentFrame = current?.background.kind === "frame" ? current.background : null;
  const savedFrame = slide?.background.kind === "frame" ? slide.background : null;
  const box = savedFrame?.highlight?.box;
  const editTargets: PreviewEditTarget[] = box ? [{ id: slide!.id, kind: "overlay", canResize: true, resizeProportionally: true, box: { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top } }] : [];
  const activeHighlightStyle = savedFrame?.highlight?.style === "none" ? "border" : savedFrame?.highlight?.style ?? "border";

  return <section className="screen carousel-workspace" aria-label={`${props.carousel.name} 작업 화면`}>
    <header className="carousel-workspace-header"><div><ActionButton variant="neutralWeak" onClick={props.onBack}>캐러셀 목록</ActionButton><h1 className="screen-title">{props.carousel.name}</h1></div><div className="carousel-workspace-actions"><ActionButton variant="brandSolid" disabled={downloading || !canDownloadSlides(props.carousel.slides)} loading={downloading} onClick={() => void handleDownload()}>모두 받기</ActionButton>{props.jobs.some(job => job.projectId === props.carousel.id) ? <ActionButton variant="neutralWeak" onClick={() => void cancelAll()}>전체 취소</ActionButton> : null}</div></header>
    <div className="carousel-editor">
      <aside className="carousel-slides" aria-label="캐러셀 장 목록">{props.carousel.slides.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === slide?.id} className="carousel-slide-choice" onClick={() => setSelectedId(item.id)}><span className="carousel-slide-thumb" style={{ aspectRatio: `${size.width} / ${size.height}` }}>{slideImage(item) ? <CarouselImage carouselId={props.carousel.id} file={slideImage(item)!.file} /> : <span>{index + 1}</span>}</span><span className="carousel-slide-label">{index + 1}장 <small>{slideStatus(item) === "idle" || slideStatus(item) === "queued" ? "대기" : slideStatus(item) === "running" ? "생성 중" : slideStatus(item) === "done" ? "완료" : "실패"}</small></span></button>)}</aside>
      <main className="carousel-preview-area"><div className="carousel-player" style={{ aspectRatio: `${size.width} / ${size.height}` }}>{slide && current ? <>
        <Player component={CarouselSlide} inputProps={{ imageUrl, texts: current.texts, brightness: current.brightness, shade: current.shade, aspect: props.carousel.aspect, frameCropY: currentFrame?.cropY, highlight: highlightChoice === "none" || currentFrame?.highlight?.style === "ai-outline" ? undefined : currentFrame?.highlight as { style: "border" | "dim" | "zoom"; box?: import("../../core/carousel").CarouselBox; color?: string; width?: number } }} durationInFrames={1} fps={30} compositionWidth={size.width} compositionHeight={size.height} controls={false} style={{ width: "100%", height: "100%" }} />
        {currentFrame && box && highlightChoice !== "none" ? <PreviewEditLayer targets={editTargets} selectedId={boxSelected ? slide.id : null} safeZone={false} onSelect={() => setBoxSelected(true)} onDragStart={() => undefined} onPreview={() => undefined} onCommit={(_id, next) => { const nextBox = { left: next.x, top: next.y, right: next.x + next.width, bottom: next.y + next.height }; void saveHighlight({ box: nextBox }); }} /> : null}
        </> : <p>장을 선택해 주세요.</p>}</div><p className="carousel-preview-caption">{slide ? `${props.carousel.aspect} · ${props.carousel.slides.findIndex(item => item.id === slide.id) + 1} / ${props.carousel.slides.length}장` : ""}</p>
        {currentFrame && !box && highlightChoice !== "none" ? <div className="carousel-box-empty"><p>{sourceAvailable ? "자동 상자를 찾지 못했어요. Jev가 꺼져 있거나 신뢰도가 낮아요." : "자동 상자를 찾지 못했어요. 상자를 직접 그려 주세요."}</p><ActionButton variant="neutralWeak" onClick={() => void saveHighlight({ box: defaultHighlightBox() })}>상자 그리기</ActionButton></div> : null}
      </main>
      <aside className="carousel-inspector" aria-label="장 편집">{current ? <>
        <TextField label="제목" value={current.texts[0]!.text} maxGraphemeCount={500} onValueChange={({ value }) => setEdited({ ...current, texts: current.texts.map((text, i) => i === 0 ? { ...text, text: value } : text) })}><TextFieldInput maxLength={500} onBlur={() => void persist({ texts: current.texts })} /></TextField>
        <TextField label="본문" value={current.texts[1]!.text} maxGraphemeCount={5000} onValueChange={({ value }) => setEdited({ ...current, texts: current.texts.map((text, i) => i === 1 ? { ...text, text: value } : text) })}><TextFieldTextarea maxLength={5000} onBlur={() => void persist({ texts: current.texts })} /></TextField>
        <div className="carousel-placement"><span>텍스트 위치</span><SegmentedControl aria-label="텍스트 위치" value={current.texts[0]!.y < 0.3 ? "top" : current.texts[0]!.y < 0.55 ? "center" : "bottom"} onValueChange={value => { const y = value === "top" ? 0.09 : value === "center" ? 0.40 : 0.62; const texts = current.texts.map((text, i) => i < 2 ? { ...text, y: y + i * 0.1 } : text); setEdited({ ...current, texts }); void persist({ texts }); }}><SegmentedControlItem value="top">위</SegmentedControlItem><SegmentedControlItem value="center">가운데</SegmentedControlItem><SegmentedControlItem value="bottom">아래</SegmentedControlItem></SegmentedControl></div>
        {current.background.kind === "generated" ? <TextField label="이미지 지시문" value={current.imagePrompt} maxGraphemeCount={4000} onValueChange={({ value }) => setEdited({ ...current, imagePrompt: value })}><TextFieldTextarea maxLength={4000} onBlur={() => void persist({ imagePrompt: current.imagePrompt })} /></TextField> : null}
        {showsBackgroundSection(current) && currentFrame ? <BackgroundSection
          sec={currentFrame.sec} cropY={currentFrame.cropY} duration={sourceDuration} sourceAvailable={sourceAvailable} canReextract={canReextractFrame(currentFrame, sourceAvailable)}
          style={activeHighlightStyle} target={currentFrame.highlight?.target ?? ""} color={currentFrame.highlight?.color ?? "#ffffff"} width={currentFrame.highlight?.width ?? 6} choice={highlightChoice}
          onTime={sec => setEdited({ ...current, background: { ...currentFrame, sec } })}
          onReextract={() => void reextractFrame()} onCropY={cropY => { setEdited({ ...current, background: { ...currentFrame, cropY } }); void persistFrame({ cropY }); }}
          onStyle={style => { setHighlightChoice(style); void saveHighlight({ style }); }}
          onTarget={target => { setEdited({ ...current, background: { ...currentFrame, highlight: { ...currentFrame.highlight, style: activeHighlightStyle, target } } }); }}
          onTargetSave={target => void saveHighlight({ target })} onColor={color => void saveHighlight({ color })} onWidth={value => void saveHighlight({ width: value })} onAiCreate={() => void saveHighlight({ style: "ai-outline" })}
        /> : null}
        {current.status === "failed" && current.background.kind === "generated" ? <p className="carousel-error-reason">실패: {current.error ?? "이미지를 만들지 못했어요."}</p> : null}
        {selectedJob ? <p className="carousel-job-status">{selectedJob.status === "queued" ? "대기 중" : "이미지 생성 중"}</p> : null}
        {current.background.kind === "generated" ? <ActionButton variant="neutralSolid" disabled={!current.imagePrompt.trim() || Boolean(selectedJob)} onClick={() => void regenerate()}>다시 만들기</ActionButton> : null}
      </> : null}</aside>
    </div>
    <AlertDialogRoot open={confirmIncomplete} onOpenChange={open => { if (!open) setConfirmIncomplete(false); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>완료한 장만 받을까요?</AlertDialogTitle><AlertDialogDescription>완료되지 않은 장은 빼고, 완료한 장부터 01번으로 저장합니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><ActionButton variant="neutralWeak" onClick={() => setConfirmIncomplete(false)}>취소</ActionButton><AlertDialogAction asChild><ActionButton variant="brandSolid" onClick={() => void download(true)}>완료한 장 받기</ActionButton></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialogRoot>
  </section>;
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

function slideStatus(slide: Slide): Slide["status"] {
  return slide.background.kind === "frame" ? slide.background.status : slide.status;
}

function slideImage(slide: Slide) {
  return slide.background.kind === "frame"
    ? (slide.background.highlight?.style === "ai-outline" ? slide.background.highlight.image : slide.background.frame)
    : slide.background.image ?? slide.image;
}

function CarouselImage(props: { carouselId: string; file: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true; void carouselFileUrl(props.carouselId, props.file).then(value => { if (active) setUrl(value); }); return () => { active = false; }; }, [props.carouselId, props.file]);
  return url ? <img src={url} alt="" /> : null;
}
