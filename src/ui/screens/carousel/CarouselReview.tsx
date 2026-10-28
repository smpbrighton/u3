import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, ArrowUp01Icon, ArrowDown01Icon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import type { Carousel } from "../../../core/carousel";
import { sceneFrameSec } from "../../../core/carousel-frame";
import { api } from "../../api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PropertyRow } from "../../components/u3/PropertyRow";
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Choice, IconButton, PlanningState, TextBlock } from "../../components/u3/CarouselControls";
import { useCarouselDraft } from "./useCarouselDraft";
import { useCarouselSource } from "./useCarouselSource";
import { errorMessage } from "./workflow";

export type WorkspaceProps = { carousel: Carousel; jobs: { projectId: string | null; kind: string; status: string; sceneIndex?: number | null }[]; onBack: () => void; onUpdate: (carousel: Carousel) => void; onSnackbar: (message: string) => void; onError: (message: string) => void; onSettings?: () => void; planning?: boolean; planError?: string };

export function CarouselReview(props: WorkspaceProps) {
  const editor = useCarouselDraft(props.carousel, props.onUpdate);
  const { draft } = editor;
  const source = useCarouselSource(draft.source);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const [retried, setRetried] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragged = useRef<string | null>(null);
  const blocked = busy || planning || props.planning;
  const failed = Boolean(error || (!retried && props.planError));
  const base = `/api/carousels/${encodeURIComponent(draft.id)}`;
  const run = (work: () => Promise<unknown>) => { void work().catch(e => props.onError(errorMessage(e))); };
  async function mutate(work: () => Promise<Carousel>) {
    setBusy(true); try { await editor.mutate(work); } finally { setBusy(false); }
  }
  async function replan() {
    setConfirmPlan(false); setPlanning(true); setError(""); setRetried(true);
    try { await editor.mutate(() => api<Carousel>("POST", `${base}/plan`, {})); }
    catch (e) { setError(`기획하지 못했어요: ${errorMessage(e)}. 다시 기획해 주세요`); }
    finally { setPlanning(false); }
  }
  async function generate() {
    await editor.flush();
    await api("POST", `${base}/generate`, {});
    editor.accept(await api<Carousel>("GET", base));
    props.onSnackbar("이미지를 만들기 시작했어요");
  }
  function reorder(from: string, to: string) {
    if (from === to) return;
    const ids = draft.slides.map(slide => slide.id);
    ids.splice(ids.indexOf(from), 1); ids.splice(draft.slides.findIndex(slide => slide.id === to), 0, from);
    run(() => mutate(() => api<Carousel>("PUT", `${base}/slides/order`, { slideIds: ids })));
  }
  return <section className="flex h-dvh min-h-0 min-w-0 flex-col gap-4 p-6" aria-label={`${draft.name} 검토`}>
    <header className="flex min-w-0 items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="sm" disabled={blocked} onClick={() => run(async () => { await editor.flush(); props.onBack(); })}>캐러셀 목록</Button><h1 className="truncate text-xl font-bold">{draft.name}</h1><span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">검토 중</span></div><div className="flex shrink-0 gap-2"><Button variant="outline" disabled={blocked} onClick={() => { if (failed) void replan(); else setConfirmPlan(true); }}>다시 기획</Button><Button disabled={blocked || failed} onClick={() => run(async () => { setBusy(true); try { await generate(); } finally { setBusy(false); } })}>이미지 만들기</Button></div></header>
    {planning || props.planning ? <PlanningState /> : <>
      {(error || (!retried && props.planError)) && <p role="alert" className="text-xs text-destructive">{error || props.planError}</p>}
      {!failed && <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto pb-4" aria-label="검토할 장">
          {draft.slides.map((slide, index) => <article key={slide.id} aria-label={`${index + 1}장`} className="flex gap-3 rounded-lg border border-border bg-card p-3" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = dragged.current; if (id) reorder(id, slide.id); dragged.current = null; }}>
            <div className="flex w-7 shrink-0 flex-col items-center gap-1"><button type="button" draggable disabled={blocked} aria-label={`${index + 1}장 순서 바꾸기`} title="순서 바꾸기" className="cursor-grab text-muted-foreground" onDragStart={event => { dragged.current = slide.id; event.dataTransfer.setData("text/plain", slide.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; }}><HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" /></button><b className="text-xs tabular-nums">{index + 1}</b><IconButton label={`${index + 1}장 위로`} disabled={blocked || index === 0} onClick={() => reorder(slide.id, draft.slides[index - 1]!.id)}><HugeiconsIcon icon={ArrowUp01Icon} /></IconButton><IconButton label={`${index + 1}장 아래로`} disabled={blocked || index === draft.slides.length - 1} onClick={() => reorder(slide.id, draft.slides[index + 1]!.id)}><HugeiconsIcon icon={ArrowDown01Icon} /></IconButton></div>
            {slide.background.kind === "frame" && <div className="mt-1 h-18 w-32 shrink-0 overflow-hidden rounded bg-muted">{source.thumbnail(slide.background.sec) && <img src={source.thumbnail(slide.background.sec)} alt="프레임" className="h-full w-full object-cover" />}</div>}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input aria-label={`${index + 1}장 제목`} className="h-7 text-xs font-bold" value={slide.texts.find(t => t.role === "title")?.text ?? ""} maxLength={500} onChange={e => editor.changeSlide(slide.id, { texts: slide.texts.map(t => t.role === "title" ? { ...t, text: e.target.value } : t) })} onBlur={() => run(() => editor.saveSlide(slide.id))} />
              <TextBlock label={`${index + 1}장 본문`} count={false} className="min-h-12 text-xs" value={slide.texts.find(t => t.role === "body")?.text ?? ""} maxLength={5000} onChange={e => editor.changeSlide(slide.id, { texts: slide.texts.map(t => t.role === "body" ? { ...t, text: e.target.value } : t) })} onBlur={() => run(() => editor.saveSlide(slide.id))} />
              {slide.background.kind === "generated" ? <details className="text-xs"><summary className="cursor-pointer py-1 text-muted-foreground">이미지 지시문</summary><TextBlock showLabel={false} label={`${index + 1}장 이미지 지시문`} value={slide.imagePrompt} maxLength={4000} onChange={e => editor.changeSlide(slide.id, { imagePrompt: e.target.value })} onBlur={() => run(() => editor.saveSlide(slide.id))} /></details> : <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
                <PropertyRow label="장면" className="grid-cols-[36px_minmax(0,1fr)]"><Choice label={`${index + 1}장 장면`} value={String(slide.sceneNumber ?? 1)} options={Array.from({ length: Math.max(source.script?.scenes.length ?? 0, slide.sceneNumber ?? 1) }, (_, n) => [String(n + 1), `장면 ${n + 1}`] as const)} onChange={value => {
                  const sceneNumber = Number(value); let sec = slide.background.kind === "frame" ? slide.background.sec : 0;
                  if (source.project && source.script) { const scene = source.script.scenes[sceneNumber - 1]!; const input = source.project.inputs.filter(input => input.id !== "placeholder")[scene.inputIndex - 1]; sec = sceneFrameSec(source.script.scenes, source.project.timeline, sceneNumber, input?.id); }
                  editor.changeSlide(slide.id, { sceneNumber, background: { sec } }); run(() => editor.saveSlide(slide.id));
                }} /></PropertyRow>
                <PropertyRow label="시각" value="초" className="grid-cols-[36px_minmax(0,1fr)_20px]"><Input type="number" aria-label={`${index + 1}장 시각`} className="h-7 text-xs" min={0} step={0.1} value={slide.background.sec} onChange={e => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) editor.changeSlide(slide.id, { background: { sec: Math.max(0, e.target.valueAsNumber) } }); }} onBlur={() => run(() => editor.saveSlide(slide.id))} /></PropertyRow>
                <PropertyRow label="강조 대상" className="col-span-2 grid-cols-[64px_minmax(0,1fr)]"><Input aria-label={`${index + 1}장 강조 대상`} className="h-7 text-xs" maxLength={1000} value={slide.background.highlight?.target ?? ""} onChange={e => editor.changeSlide(slide.id, { background: { highlight: { target: e.target.value } } })} onBlur={() => run(() => editor.saveSlide(slide.id))} /></PropertyRow>
              </div>}
            </div>
            <IconButton label={`${index + 1}장 지우기`} disabled={blocked || draft.slides.length <= 2} onClick={() => run(() => mutate(() => api<Carousel>("DELETE", `${base}/slides/${encodeURIComponent(slide.id)}`)))}><HugeiconsIcon icon={Delete02Icon} /></IconButton>
          </article>)}
          <Button variant="outline" size="sm" className="self-start" disabled={blocked || draft.slides.length >= 10} onClick={() => run(() => mutate(() => api<Carousel>("POST", `${base}/slides`, {})))}>장 더하기</Button>
        </div>
        <aside className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-3" aria-label="기획 속성"><TextBlock label="게시 캡션" className="min-h-35" value={draft.caption} maxLength={2000} onChange={e => editor.changeFields({ caption: e.target.value })} onBlur={() => run(editor.saveFields)} />{draft.source.kind === "topic" && <PropertyRow label="화풍" htmlFor="carousel-review-style" className="mt-3 border-t border-border pt-1"><Input id="carousel-review-style" className="h-7 text-xs" maxLength={1000} value={draft.style ?? ""} onChange={e => editor.changeFields({ style: e.target.value })} onBlur={() => run(editor.saveFields)} /></PropertyRow>}</aside>
      </div>}
    </>}
    <AlertDialog open={confirmPlan} onOpenChange={setConfirmPlan}><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>지금 글을 버리고 다시 기획할까요?</AlertDialogTitle><AlertDialogFooter><Button variant="outline" onClick={() => setConfirmPlan(false)}>취소</Button><Button variant="solid" onClick={() => void replan()}>다시 기획</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
