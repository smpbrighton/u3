import { useEffect, useState } from "react";
import type { Carousel, CarouselAspect } from "../../../core/carousel";
import type { Project } from "../../../core/schema";
import { api } from "../../api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../../components/ui/dialog";
import { PropertyRow } from "../../components/u3/PropertyRow";
import { Choice, PlanningState, TextBlock } from "../../components/u3/CarouselControls";
import { eligibleProjects, errorMessage, requestCarouselPlan } from "./workflow";

export type NewCarouselDialogProps = {
  open: boolean; initialProjectId?: string; onClose: () => void; onCreated: (carousel: Carousel) => void;
  onPlanning?: (carousel: Carousel) => void; onPlanError?: (error: string) => void; onError: (message: string) => void;
};
type Candidate = { topic: string; angle: string };
export function NewCarouselDialog(props: NewCarouselDialogProps) {
  const [mode, setMode] = useState<"topic" | "project" | null>(props.initialProjectId ? "project" : null);
  const [projectId, setProjectId] = useState(props.initialProjectId ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("");
  const [count, setCount] = useState(5);
  const [aspect, setAspect] = useState<CarouselAspect>("4:5");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [refining, setRefining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Carousel | null>(null);
  useEffect(() => {
    if (!props.open) return;
    setMode(props.initialProjectId ? "project" : null); setProjectId(props.initialProjectId ?? "");
    setTopic(""); setStyle(""); setCount(5); setCandidates([]); setSelected(null); setError(""); setCreated(null);
    let live = true;
    void api<{ aspect: CarouselAspect }>("GET", "/api/system/image-options").then(options => { if (live) setAspect(options.aspect); }).catch(e => { if (live) props.onError(errorMessage(e)); });
    return () => { live = false; };
  }, [props.open, props.initialProjectId]);
  useEffect(() => {
    if (!props.open || mode !== "project") return;
    let live = true; setLoading(true);
    void eligibleProjects().then(value => { if (live) setProjects(value); }).catch(e => { if (live) setError(`영상을 불러오지 못했어요: ${errorMessage(e)}. 다시 열어 주세요`); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [props.open, mode]);
  async function refine() {
    setRefining(true); setError("");
    try { const value = await api<{ candidates: Candidate[] }>("POST", "/api/carousels/refine", { topic: topic.trim() }); setCandidates(value.candidates); setSelected(null); }
    catch (e) { setError(`주제를 다듬지 못했어요: ${errorMessage(e)}. 다시 눌러 주세요`); }
    finally { setRefining(false); }
  }
  async function plan() {
    setBusy(true); setError("");
    let started = created;
    try {
      const value = started
        ? await api<Carousel>("POST", `/api/carousels/${encodeURIComponent(started.id)}/plan`, {})
        : await requestCarouselPlan(mode === "project" ? { kind: "project", projectId, count, aspect } : { kind: "topic", topic: topic.trim(), count, aspect, style }, api, value => { started = value; setCreated(value); props.onPlanning?.(value); });
      props.onCreated(value); props.onClose();
    } catch (e) {
      const text = `기획하지 못했어요: ${errorMessage(e)}. 다시 기획해 주세요`;
      setError(text); if (started) props.onPlanError?.(text);
    } finally { setBusy(false); }
  }
  const valid = mode === "topic" ? Boolean(topic.trim()) : Boolean(projectId && projects.some(p => p.id === projectId));
  return <Dialog open={props.open} onOpenChange={open => { if (!open && !busy) props.onClose(); }}><DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto sm:max-w-130" showCloseButton={!busy}>
    <DialogTitle>새 캐러셀{mode === "project" ? " · 영상으로" : ""}</DialogTitle>
    {busy ? <PlanningState /> : <>
      {mode === null ? <div className="grid grid-cols-2 gap-3">{([["topic", "주제로"], ["project", "영상으로"]] as const).map(([value, label]) => <Button key={value} variant="outline" className="h-24 justify-start rounded-lg p-4 font-bold" onClick={() => setMode(value)}>{label}</Button>)}</div> : <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setMode(null)}>방식 선택</Button>
        {mode === "topic" ? <>
          <TextBlock label="주제" value={topic} maxLength={1000} onChange={e => { setTopic(e.target.value); setSelected(null); }} />
          <Button variant="outline" size="sm" className="self-start" disabled={!topic.trim() || refining} onClick={() => void refine()}>{refining ? "다듬는 중" : "AI 로 다듬기"}</Button>
          {candidates.length > 0 && <div role="radiogroup" aria-label="다듬은 주제 후보" className="flex flex-col gap-1.5">{candidates.map((candidate, index) => <button type="button" key={index} role="radio" aria-checked={selected === index} className={`flex flex-col gap-1 rounded-lg border p-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === index ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`} onClick={() => { setSelected(index); setTopic(candidate.topic); }}><strong>{candidate.topic}</strong><span className="text-muted-foreground">{candidate.angle}</span></button>)}</div>}
        </> : <div role="radiogroup" aria-label="프로젝트 선택" className="flex max-h-60 flex-col gap-1 overflow-y-auto">{loading ? <div role="status" className="h-20 animate-pulse rounded-md bg-muted" aria-label="영상 불러오는 중" /> : projects.length ? projects.map(project => <button type="button" role="radio" aria-checked={projectId === project.id} key={project.id} onClick={() => setProjectId(project.id)} className={`flex min-w-0 items-center gap-3 rounded-md border p-2 text-left text-xs ${projectId === project.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}><ProjectThumbnail project={project} /><span className="min-w-0 truncate font-bold">{project.name}</span></button>) : <p className="py-6 text-center text-xs text-muted-foreground">기획할 영상이 없어요</p>}</div>}
        <PropertyRow label="장 수"><Choice label="장 수" value={String(count)} options={Array.from({ length: 9 }, (_, i) => [String(i + 2), `${i + 2}장`] as const)} onChange={value => setCount(Number(value))} /></PropertyRow>
        <PropertyRow label="비율"><Choice label="비율" value={aspect} options={["4:5", "1:1", "9:16", "16:9"].map(value => [value, value])} onChange={value => setAspect(value as CarouselAspect)} /></PropertyRow>
        {mode === "topic" && <PropertyRow label="화풍" htmlFor="carousel-new-style"><Input id="carousel-new-style" className="h-7 text-xs" value={style} maxLength={1000} onChange={e => setStyle(e.target.value)} /></PropertyRow>}
      </div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={props.onClose}>취소</Button>{mode && <Button disabled={!valid || refining} onClick={() => void plan()}>{created || error.startsWith("기획") ? "다시 기획" : "기획"}</Button>}</DialogFooter>
    </>}
  </DialogContent></Dialog>;
}

function ProjectThumbnail({ project }: { project: Project }) {
  const [url, setUrl] = useState("");
  const input = project.inputs.find(input => input.id !== "placeholder" && input.kind === "video");
  useEffect(() => {
    let live = true;
    if (input) void api<{ url: string }>("GET", `/api/projects/${encodeURIComponent(project.id)}/inputs/${encodeURIComponent(input.id)}/thumbnail`).then(value => { if (live) setUrl(value.url); }).catch(() => undefined);
    return () => { live = false; };
  }, [project.id, input?.id]);
  return <span className="h-9 w-16 shrink-0 overflow-hidden rounded bg-muted">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</span>;
}
