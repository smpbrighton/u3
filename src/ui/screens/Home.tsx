import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { CodexWarning } from "../components/u3/CodexWarning";
import { EmptyState } from "../components/u3/EmptyState";
import { FlowIconButton } from "../components/u3/FlowIconButton";
import { toast } from "sonner";
import { api, mediaUrl } from "../api";
import type { Project, SystemStatus } from "../types";
import { Add01Icon, MoreHorizontalIcon, Video01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "../components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { projectThumbnailInput } from "./home-thumbnail";
import { DerivedCarouselDialog } from "./carousel/DerivedCarouselDialog";
import type { Carousel } from "../../core/carousel";

export function HomeProjectMenuItems(props: { project: Project; onRename: () => void; onCarousel: () => void; onDelete: () => void }) {
  return <>
    <DropdownMenuItem onSelect={props.onRename}>이름 바꾸기</DropdownMenuItem>
    {props.project.timeline.video.length > 0 && props.project.inputs.some(input => input.kind === "video") && <DropdownMenuItem onSelect={props.onCarousel}>캐러셀 만들기</DropdownMenuItem>}
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive" onSelect={props.onDelete}>삭제</DropdownMenuItem>
  </>;
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "어제" : `${days}일 전`;
}

function timelineDuration(project: Project): number {
  return project.timeline.video.reduce<number>((total, item) => {
    if (!item || typeof item !== "object") return total;
    const clip = item as { durationSec?: unknown; inStartSec?: unknown; inEndSec?: unknown };
    if (typeof clip.durationSec === "number") return total + clip.durationSec;
    if (typeof clip.inStartSec === "number" && typeof clip.inEndSec === "number") {
      return total + Math.max(0, clip.inEndSec - clip.inStartSec);
    }
    return total;
  }, 0);
}

function durationLabel(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function Home(props: {
  status: SystemStatus | null;
  onNew: (project: Project) => void;
  onOpen: (project: Project) => void;
  onSettings: () => void;
  onCarouselCreated: (carousel: Carousel) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const setError = (message: string | null) => { if (message) toast.error(message); };
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [carouselProject, setCarouselProject] = useState<Project | null>(null);

  useEffect(() => {
    let active = true;
    void api<Project[]>("GET", "/api/projects").then(async data => {
      if (!active) return;
      setProjects(data);
      setLoading(false);
      const thumbnailInputs = data.flatMap(project => {
        const input = projectThumbnailInput(project);
        return input ? [{ project, input }] : [];
      });
      const urls = await Promise.all(thumbnailInputs.map(async ({ project, input }) => {
        try {
          const url = input.kind === "video"
            ? (await api<{ url: string }>("GET", `/api/projects/${encodeURIComponent(project.id)}/inputs/${encodeURIComponent(input.id)}/thumbnail`)).url
            : await mediaUrl(project.id, input.file);
          return [project.id, url] as const;
        } catch {
          return null;
        }
      }));
      if (active) setThumbnails(Object.fromEntries(urls.filter((entry): entry is readonly [string, string] => entry !== null)));
    }).catch(reason => {
      if (!active) return;
      setLoadFailed(true);
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const createProject = async () => {
    if (pending) return;
    setPending(true);
    try {
      const project = await api<Project>("POST", "/api/projects", { name: "새 영상" });
      props.onNew(project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setPending(false); }
  };

  const deleteProject = async () => {
    if (!deleting || pending) return;
    setPending(true);
    try {
      await api("DELETE", `/api/projects/${encodeURIComponent(deleting.id)}`);
      setProjects(current => current.filter(project => project.id !== deleting.id));
      setDeleting(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setPending(false); }
  };

  const renameProject = async () => {
    if (!editing || !name.trim() || pending) return;
    setPending(true);
    try {
      const updated = await api<Project>("PUT", `/api/projects/${encodeURIComponent(editing.id)}`, { ...editing, name: name.trim(), savedAt: new Date().toISOString() });
      setProjects(current => current.map(project => project.id === updated.id ? updated : project));
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setPending(false); }
  };

  return (
    <section className="u3-shell flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-10 pt-7 pb-10" aria-labelledby="home-title">
      <CodexWarning status={props.status} onSettings={props.onSettings} />
      <header className="flex shrink-0 items-center justify-between gap-5">
        <h1 id="home-title" className="text-xl font-bold">영상</h1>
        {(loading || projects.length > 0 || loadFailed) && <Button disabled={pending} onClick={() => void createProject()}><HugeiconsIcon icon={Add01Icon} aria-hidden="true" />새 영상</Button>}
      </header>
      {loading ? <div className="flex flex-wrap gap-6" aria-busy="true" aria-label="영상 불러오는 중" role="status">
        {[0, 1, 2].map(index => <div className="flex w-[200px] flex-col gap-2.5" key={index} aria-hidden="true">
          <div className="aspect-[9/16] animate-pulse rounded-lg bg-muted" />
          <div className="h-3.5 w-[120px] animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
        </div>)}
      </div> : projects.length ? <div className="flex flex-wrap gap-6" aria-label="영상 목록">
        {projects.map(project => {
          const inputCount = project.inputs.filter(input => input.id !== "placeholder").length;
          const scenes = project.timeline.captionLayers?.[0]?.main.length ?? project.timeline.captions.length;
          const duration = timelineDuration(project);
          const complete = project.timeline.video.length > 0;
          return <article className="relative flex w-[200px] flex-col gap-2" key={project.id}>
            <button type="button" className="group flex flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${project.name} 열기`} onClick={() => props.onOpen(project)}>
              <span className="relative block aspect-[9/16] w-full overflow-hidden rounded-lg border border-border bg-muted group-hover:border-ring">
                {thumbnails[project.id] && <img src={thumbnails[project.id]} alt="" className="h-full w-full object-cover" />}
                {duration > 0 && <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-background/90 px-1.5 py-0.5 text-2xs text-foreground tabular-nums">{durationLabel(duration)}</span>}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pr-7">
                <span className="flex items-center gap-1.5">
                  <strong className="min-w-0 truncate text-sm">{project.name}</strong>
                  {!complete && <span className="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">대본 전</span>}
                </span>
                <span className="text-2xs text-muted-foreground">{scenes ? `장면 ${scenes}` : inputCount ? `미디어 ${inputCount}` : "미디어 넣기 전"} · {relativeTime(project.savedAt)}</span>
              </span>
            </button>
            <div className="absolute right-0 bottom-4">
              <DropdownMenu open={openMenu === project.id} onOpenChange={open => setOpenMenu(open ? project.id : null)}>
                <DropdownMenuTrigger asChild><FlowIconButton label={`${project.name} 메뉴`} size="icon-sm"><HugeiconsIcon icon={MoreHorizontalIcon} aria-hidden="true" /></FlowIconButton></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <HomeProjectMenuItems project={project} onRename={() => { setEditing(project); setName(project.name); setOpenMenu(null); }} onCarousel={() => { setCarouselProject(project); setOpenMenu(null); }} onDelete={() => { setDeleting(project); setOpenMenu(null); }} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </article>;
        })}
      </div> : !loadFailed && <EmptyState className="min-h-[300px]" message="아직 영상이 없어요" icon={<HugeiconsIcon icon={Video01Icon} />} action={{ label: "새 영상", onClick: () => void createProject(), disabled: pending }} />}
      <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>‘{deleting?.name}’을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>되돌릴 수 없어요</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>취소</AlertDialogCancel><Button variant="destructive" disabled={pending} onClick={() => void deleteProject()}>삭제</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !pending) setEditing(null); }}>
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogHeader><DialogTitle>이름 바꾸기</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void renameProject(); }}>
            <Input aria-label="영상 이름" value={name} onChange={event => setName(event.target.value)} disabled={pending} autoFocus />
            <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setEditing(null)}>취소</Button><Button type="submit" variant="solid" disabled={!name.trim() || pending}>저장</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {carouselProject && <DerivedCarouselDialog open projectId={carouselProject.id} onClose={() => setCarouselProject(null)} onCreated={props.onCarouselCreated} onError={setError} />}
    </section>
  );
}
