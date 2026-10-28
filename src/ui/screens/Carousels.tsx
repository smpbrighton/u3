import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import type { Carousel } from "../../core/carousel";
import { api, watchJobs } from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "../components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { EmptyState } from "../components/u3/EmptyState";
import { CarouselWorkspace } from "./carousel/CarouselWorkspace";
import { CarouselImage } from "./carousel/CarouselImage";
import { NewCarouselDialog } from "./carousel/NewCarouselDialog";
import { errorMessage, slideImage, slideStatus } from "./carousel/workflow";
import type { WorkspaceProps } from "./carousel/CarouselReview";

export function Carousels(props: { initialCarousel?: Carousel | null; onSnackbar: (message: string) => void; onError: (message: string) => void; onSettings?: () => void }) {
  const [items, setItems] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Carousel | null>(props.initialCarousel ?? null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [rename, setRename] = useState<Carousel | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Carousel | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<WorkspaceProps["jobs"]>([]);
  function updateActive(value: Carousel) { setActive(current => current?.id === value.id && current.savedAt > value.savedAt ? current : value); }
  async function reload() {
    setLoading(true); setError("");
    try { setItems(await api<Carousel[]>("GET", "/api/carousels")); }
    catch (e) { setError(`캐러셀을 불러오지 못했어요: ${errorMessage(e)}. 다시 불러와 주세요`); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => { setActive(props.initialCarousel ?? null); }, [props.initialCarousel?.id]);
  useEffect(() => {
    const controller = new AbortController();
    const id = active?.id;
    let sequence = 0;
    void watchJobs(received => {
      if (controller.signal.aborted) return;
      const relevant = received.filter(job => job.kind === "image");
      setJobs(current => [...current.filter(job => !relevant.some(next => next.projectId === job.projectId && next.sceneIndex === job.sceneIndex)), ...relevant].filter(job => ["queued", "running"].includes(job.status)));
      if (!id || !relevant.some(job => job.projectId === id)) return;
      const revision = ++sequence;
      void api<Carousel>("GET", `/api/carousels/${encodeURIComponent(id)}`).then(value => { if (!controller.signal.aborted && revision === sequence) updateActive(value); }).catch(e => { if (!controller.signal.aborted) props.onError(errorMessage(e)); });
    }, controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [active?.id]);
  async function openItem(id: string) {
    try { setPlanError(""); setActive(await api<Carousel>("GET", `/api/carousels/${encodeURIComponent(id)}`)); }
    catch (e) { props.onError(errorMessage(e)); }
  }
  async function saveName() {
    if (!rename || !name.trim()) return;
    setBusy(true);
    try { const value = await api<Carousel>("PUT", `/api/carousels/${encodeURIComponent(rename.id)}`, { name: name.trim() }); setItems(current => current.map(item => item.id === value.id ? value : item)); setRename(null); }
    catch (e) { props.onError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try { await api("DELETE", `/api/carousels/${encodeURIComponent(deleting.id)}`); setItems(current => current.filter(item => item.id !== deleting.id)); setDeleting(null); }
    catch (e) { props.onError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  if (active) return <CarouselWorkspace key={active.id} carousel={active} jobs={jobs} onBack={() => { setActive(null); setPlanError(""); void reload(); }} onUpdate={updateActive} onSnackbar={props.onSnackbar} onError={props.onError} onSettings={props.onSettings} planning={planning} planError={planError} />;
  return <section className="flex min-h-dvh min-w-0 flex-col gap-6 p-7" aria-labelledby="carousel-title">
    <header className="flex items-center justify-between gap-4"><h1 id="carousel-title" className="text-xl font-bold">캐러셀</h1>{(loading || items.length > 0) && <Button onClick={() => setCreating(true)}>새 캐러셀</Button>}</header>
    {error ? <div role="alert" className="flex items-center gap-3 text-xs"><p className="text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => void reload()}>다시 불러오기</Button></div> : loading ? <div role="status" aria-label="캐러셀 불러오는 중" className="flex flex-wrap gap-6">{[1, 2, 3].map(n => <div key={n} className="flex w-65 animate-pulse flex-col gap-2.5"><div className="h-36.5 rounded-md bg-muted" /><div className="h-3.5 w-40 rounded bg-muted" /><div className="h-2.5 w-20 rounded bg-muted" /></div>)}</div> : items.length ? <div className="flex flex-wrap gap-6" aria-label="캐러셀 목록">{items.map(item => {
      const image = item.slides.map(slideImage).find(Boolean);
      return <article className="flex w-65 min-w-0 flex-col gap-2" key={item.id}>
        <button type="button" className="grid h-36.5 w-full place-items-center overflow-hidden rounded-lg bg-muted text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${item.name} 열기`} onClick={() => void openItem(item.id)}>{image ? <CarouselImage carouselId={item.id} file={image.file} /> : <span>{item.slides.length}장</span>}</button>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-start gap-1"><button type="button" className="flex min-w-0 flex-col gap-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void openItem(item.id)}><span className="flex min-w-0 w-full items-center gap-1.5"><strong className="min-w-0 flex-1 truncate text-[13px]">{item.name}</strong>{item.source.kind === "project" && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">영상에서</span>}</span><span className="text-[11px] text-muted-foreground">{item.stage === "review" ? "검토 중" : `${item.slides.length}장 · ${item.slides.filter(slide => slideStatus(slide) === "done").length}장 완료`}</span></button>
          <DropdownMenu><TooltipProvider><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`${item.name} 메뉴`}><HugeiconsIcon icon={MoreHorizontalIcon} /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>더 보기</TooltipContent></Tooltip></TooltipProvider><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setRename(item); setName(item.name); }}>이름 바꾸기</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleting(item)}>삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </article>;
    })}</div> : <EmptyState message="아직 캐러셀이 없어요" action={{ label: "새 캐러셀", onClick: () => setCreating(true) }} />}
    <NewCarouselDialog open={creating} onClose={() => setCreating(false)} onCreated={value => { setActive(value); setPlanning(false); setPlanError(""); }} onPlanning={value => { setActive(value); setPlanning(true); setPlanError(""); }} onPlanError={error => { setPlanError(error); setPlanning(false); }} onError={props.onError} />
    <Dialog open={Boolean(rename)} onOpenChange={open => { if (!open && !busy) setRename(null); }}><DialogContent aria-describedby={undefined} showCloseButton={false}><DialogTitle>이름 바꾸기</DialogTitle><Input aria-label="캐러셀 이름" value={name} maxLength={120} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !busy) void saveName(); }} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRename(null)}>취소</Button><Button variant="solid" disabled={!name.trim() || busy} onClick={() => void saveName()}>저장</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogTitle>‘{deleting?.name}’을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>생성한 이미지도 지워져요</AlertDialogDescription><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>취소</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>삭제</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
