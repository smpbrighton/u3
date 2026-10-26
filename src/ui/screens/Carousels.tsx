import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
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

type Candidate = { topic: string; angle: string };
type Job = { projectId: string | null; kind: string; sceneIndex?: number | null; status: string };

export function Carousels(props: { onSnackbar: (message: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<Carousel[]>([]);
  const [active, setActive] = useState<Carousel | null>(null);
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
        <span className="project-thumb carousel-card-thumb">{item.slides.find(slide => slide.image)?.image ? <CarouselImage carouselId={item.id} file={item.slides.find(slide => slide.image)!.image!.file} /> : <span>{item.slides.length}장</span>}</span>
        <span className="project-card-body"><span className="project-name">{item.name}</span><span className="project-meta">{item.slides.length}장 · {item.slides.filter(slide => slide.status === "done").length}장 완료</span></span>
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
  const size = carouselCanvasSize(props.carousel.aspect);
  const unfinished = props.carousel.slides.some(item => item.status !== "done" || !item.image);
  const selectedJob = props.jobs.find(job => job.projectId === props.carousel.id && job.sceneIndex === props.carousel.slides.findIndex(item => item.id === slide?.id));

  useEffect(() => { setEdited(null); }, [slide?.id, slide?.title, slide?.body, slide?.textPlacement, slide?.imagePrompt]);
  useEffect(() => {
    let active = true;
    if (slide?.image) void carouselFileUrl(props.carousel.id, slide.image.file).then(url => { if (active) setImageUrl(url); });
    else setImageUrl("");
    return () => { active = false; };
  }, [props.carousel.id, slide?.image?.file]);
  async function persist(fields: Partial<Pick<Slide, "title" | "body" | "textPlacement" | "imagePrompt">>) {
    if (!slide) return;
    try { const updated = await api<Carousel>("PATCH", `/api/carousels/${props.carousel.id}/slides/${slide.id}`, fields); props.onUpdate(updated); setEdited(updated.slides.find(item => item.id === slide.id) ?? null); }
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

  return <section className="screen carousel-workspace" aria-label={`${props.carousel.name} 작업 화면`}>
    <header className="carousel-workspace-header"><div><ActionButton variant="neutralWeak" onClick={props.onBack}>캐러셀 목록</ActionButton><h1 className="screen-title">{props.carousel.name}</h1></div><div className="carousel-workspace-actions"><ActionButton variant="brandSolid" disabled={downloading} loading={downloading} onClick={() => void handleDownload()}>모두 받기</ActionButton>{props.jobs.some(job => job.projectId === props.carousel.id) ? <ActionButton variant="neutralWeak" onClick={() => void cancelAll()}>전체 취소</ActionButton> : null}</div></header>
    <div className="carousel-editor">
      <aside className="carousel-slides" aria-label="캐러셀 장 목록">{props.carousel.slides.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === slide?.id} className="carousel-slide-choice" onClick={() => setSelectedId(item.id)}><span className="carousel-slide-thumb">{item.image ? <CarouselImage carouselId={props.carousel.id} file={item.image.file} /> : <span>{index + 1}</span>}</span><span className="carousel-slide-label">{index + 1}장 <small>{item.status === "idle" ? "대기" : item.status === "queued" ? "대기" : item.status === "running" ? "생성 중" : item.status === "done" ? "완료" : "실패"}</small></span></button>)}</aside>
      <main className="carousel-preview-area"><div className="carousel-player" style={{ aspectRatio: `${size.width} / ${size.height}` }}>{slide && current ? <Player component={CarouselSlide} inputProps={{ imageUrl, title: current.title, body: current.body, textPlacement: current.textPlacement, aspect: props.carousel.aspect }} durationInFrames={1} fps={30} compositionWidth={size.width} compositionHeight={size.height} controls={false} style={{ width: "100%", height: "100%" }} /> : <p>장을 선택해 주세요.</p>}</div><p className="carousel-preview-caption">{slide ? `${props.carousel.aspect} · ${props.carousel.slides.findIndex(item => item.id === slide.id) + 1} / ${props.carousel.slides.length}장` : ""}</p></main>
      <aside className="carousel-inspector" aria-label="장 편집">{current ? <>
        <TextField label="제목" value={current.title} maxGraphemeCount={500} onValueChange={({ value }) => setEdited({ ...current, title: value })}><TextFieldInput maxLength={500} onBlur={() => void persist({ title: current.title })} /></TextField>
        <TextField label="본문" value={current.body} maxGraphemeCount={5000} onValueChange={({ value }) => setEdited({ ...current, body: value })}><TextFieldTextarea maxLength={5000} onBlur={() => void persist({ body: current.body })} /></TextField>
        <div className="carousel-placement"><span>텍스트 위치</span><SegmentedControl aria-label="텍스트 위치" value={current.textPlacement} onValueChange={value => { const textPlacement = value as Slide["textPlacement"]; setEdited({ ...current, textPlacement }); void persist({ textPlacement }); }}><SegmentedControlItem value="top">위</SegmentedControlItem><SegmentedControlItem value="center">가운데</SegmentedControlItem><SegmentedControlItem value="bottom">아래</SegmentedControlItem></SegmentedControl></div>
        <TextField label="이미지 지시문" value={current.imagePrompt} maxGraphemeCount={4000} onValueChange={({ value }) => setEdited({ ...current, imagePrompt: value })}><TextFieldTextarea maxLength={4000} onBlur={() => void persist({ imagePrompt: current.imagePrompt })} /></TextField>
        {current.status === "failed" ? <p className="carousel-error-reason">실패: {current.error ?? "이미지를 만들지 못했어요."}</p> : null}
        {selectedJob ? <p className="carousel-job-status">{selectedJob.status === "queued" ? "대기 중" : "이미지 생성 중"}</p> : null}
        <ActionButton variant="neutralSolid" disabled={!current.imagePrompt.trim() || Boolean(selectedJob)} onClick={() => void regenerate()}>다시 만들기</ActionButton>
      </> : null}</aside>
    </div>
    <AlertDialogRoot open={confirmIncomplete} onOpenChange={open => { if (!open) setConfirmIncomplete(false); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>완료한 장만 받을까요?</AlertDialogTitle><AlertDialogDescription>완료되지 않은 장은 빼고, 완료한 장부터 01번으로 저장합니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><ActionButton variant="neutralWeak" onClick={() => setConfirmIncomplete(false)}>취소</ActionButton><AlertDialogAction asChild><ActionButton variant="brandSolid" onClick={() => void download(true)}>완료한 장 받기</ActionButton></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialogRoot>
  </section>;
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

function CarouselImage(props: { carouselId: string; file: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true; void carouselFileUrl(props.carouselId, props.file).then(value => { if (active) setUrl(value); }); return () => { active = false; }; }, [props.carouselId, props.file]);
  return url ? <img src={url} alt="" /> : null;
}
