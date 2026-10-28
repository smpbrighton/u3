import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../components/ui/button";
import { Input as NameInput } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { StepNav } from "../components/u3/StepNav";
import { FlowIconButton } from "../components/u3/FlowIconButton";
import { cn } from "../components/ui/utils";
import { api, mediaUrl } from "../api";
import type { Input as ProjectInput, Project } from "../types";
import { inputDisplayName } from "../../core/input";
import { ArrowLeft01Icon, ArrowUp01Icon, ArrowDown01Icon, ArrowRight01Icon, Cancel01Icon, DragDropVerticalIcon, FileUploadIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useBeforeUpdateRestart } from "../update-save";

const VIDEO = new Set(["mp4", "mov", "m4v"]);
const PHOTO = new Set(["jpg", "jpeg", "png", "heic", "webp"]);

function mediaKind(file: string): ProjectInput["kind"] | null {
  const ext = file.split(".").at(-1)?.toLowerCase() ?? "";
  if (VIDEO.has(ext)) return "video";
  if (PHOTO.has(ext)) return "photo";
  return null;
}

export function Input(props: {
  project: Project;
  onProject: (project: Project) => void;
  onBack: () => void;
  onNext: () => void;
  onScript: () => void;
  onStudio: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(props.project.name);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const nameRef = useRef(name);
  const projectRef = useRef(props.project);
  nameRef.current = name;
  projectRef.current = props.project;
  const unlisten = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const nameSaveRef = useRef<{ name: string; promise: Promise<Project> } | null>(null);
  const inputs = props.project.inputs.filter(input => input.id !== "placeholder");

  useEffect(() => {
    let active = true;
    void Promise.all(inputs.map(async input => [input.id, input.kind === "video"
      ? (await api<{ url: string }>("GET", `/api/projects/${props.project.id}/inputs/${input.id}/thumbnail`)).url
      : await mediaUrl(props.project.id, input.file)] as const))
      .then(entries => { if (active) setMediaUrls(Object.fromEntries(entries)); })
      .catch(error => { if (active) props.onError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [props.project.id, props.project.inputs]);

  useEffect(() => {
    let active = true;
    if (isTauri()) {
      void getCurrentWebview().onDragDropEvent(event => {
        if (event.payload.type === "enter") setDragging(true);
        if (event.payload.type === "leave") setDragging(false);
        if (event.payload.type === "drop") {
          setDragging(false);
          void addPaths(event.payload.paths);
        }
      }).then(stop => {
        if (active) unlisten.current = stop;
        else stop();
      });
    }
    return () => {
      active = false;
      unlisten.current?.();
    };
  }, [props.project.id, props.project.inputs]);

  async function addPaths(paths: string[]) {
    if (busyRef.current) return;
    const available = 20 - inputs.length;
    if (paths.some(file => !mediaKind(file))) props.onError("mp4·mov 영상이나 jpg·png·heic 사진만 넣을 수 있어요");
    if (paths.filter(file => mediaKind(file)).length > available) props.onError("20개까지 넣을 수 있어요");
    const accepted = paths.filter(file => mediaKind(file)).slice(0, available);
    if (!accepted.length) {
      if (!paths.length) props.onError("mp4·mov 영상이나 jpg·png·heic 사진만 넣을 수 있어요");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await persistName();
      const added = await api<Project>("POST", `/api/projects/${props.project.id}/inputs`, {
        files: accepted.map(file => ({ path: file, kind: mediaKind(file) })),
      });
      props.onProject(added);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function persistName() {
    const trimmed = nameRef.current.trim();
    if (nameSaveRef.current?.name === trimmed) return nameSaveRef.current.promise;
    const base = nameSaveRef.current ? await nameSaveRef.current.promise : projectRef.current;
    if (!trimmed || trimmed === base.name) return base;
    const promise = api<Project>("PUT", `/api/projects/${base.id}`, { ...base, name: trimmed, savedAt: new Date().toISOString() });
    const saving = { name: trimmed, promise };
    nameSaveRef.current = saving;
    try {
      const next = await promise;
      projectRef.current = next;
      props.onProject(next);
      return next;
    } finally { if (nameSaveRef.current === saving) nameSaveRef.current = null; }
  }

  async function navigate(action: () => void) {
    if (busyRef.current) return;
    try { await persistName(); action(); }
    catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
  }

  useBeforeUpdateRestart(async () => { await persistName(); });

  async function chooseFiles() {
    try {
      const selected = await open({
        title: "영상·사진 넣기",
        multiple: true,
        filters: [{ name: "영상과 사진", extensions: [...VIDEO, ...PHOTO] }],
      });
      if (Array.isArray(selected)) await addPaths(selected);
      else if (selected) await addPaths([selected]);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeInput(inputId: string) {
    if (busyRef.current) return;
    const remaining = inputs.filter(input => input.id !== inputId);
    const next = {
      ...props.project,
      inputs: remaining.length ? remaining : [{ id: "placeholder", kind: "photo" as const, file: "pending" }],
      savedAt: new Date().toISOString(),
    };
    try {
      const named = await persistName();
      const saved = await api<Project>("PUT", `/api/projects/${next.id}`, { ...next, name: named.name });
      props.onProject(saved);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function reorder(from: number, to: number) {
    if (busyRef.current) return;
    if (to < 0 || to >= inputs.length || from === to) return;
    const reordered = [...inputs];
    const [item] = reordered.splice(from, 1);
    if (item) reordered.splice(to, 0, item);
    try {
      await persistName();
      const saved = await api<Project>("PUT", `/api/projects/${props.project.id}/inputs/order`, { ids: reordered.map(input => input.id) });
      props.onProject(saved);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function next() {
    if (inputs.length < 1) {
      props.onError("영상이나 사진을 1개 이상 넣어 주세요.");
      return;
    }
    try {
      await persistName();
      props.onNext();
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="u3-shell flex h-full min-h-0 flex-col" aria-label="미디어 넣기"
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault(); setDragging(false);
        void addPaths(Array.from(event.dataTransfer.files).map(file => (file as File & { path?: string }).path).filter((file): file is string => Boolean(file)));
      }}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <FlowIconButton label="영상 목록으로 돌아가기" disabled={busy} onClick={() => void navigate(props.onBack)}><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /></FlowIconButton>
        <NameInput className="w-60" aria-label="영상 이름" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} onBlur={() => void persistName().catch(error => props.onError(error instanceof Error ? error.message : String(error)))} />
        <div className="flex min-w-0 flex-1 justify-center">
          <StepNav current="media" steps={[
            { id: "media", label: "미디어", disabled: busy },
            { id: "script", label: "대본", disabled: !inputs.length || busy },
            { id: "studio", label: "스튜디오", disabled: !props.project.timeline.video.length || busy },
          ]} onStepChange={value => {
            if (value === "script") void navigate(props.onScript);
            if (value === "studio") void navigate(props.onStudio);
          }} />
        </div>
        <Button variant="solid" disabled={!inputs.length || busy} onClick={() => void next()}>다음: 대본<HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></Button>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-10 py-8">
        <div className="flex w-full max-w-[880px] flex-col gap-4">
          {busy ? <div className="flex h-[72px] shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-5" role="status" aria-live="polite" aria-busy="true">
            <HugeiconsIcon icon={Loading03Icon} aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
            <strong>넣는 중</strong><Progress className="flex-1" aria-label="미디어 넣는 중" />
          </div> : <Button variant="outline" className={cn("shrink-0 justify-start gap-3 rounded-xl border-dashed bg-card px-5", inputs.length ? "h-[72px]" : "min-h-[320px] flex-1 flex-col items-center justify-center gap-3.5", dragging && "border-ring ring-2 ring-ring")}
            disabled={inputs.length >= 20} data-dragging={dragging} onClick={() => void chooseFiles()}>
            <HugeiconsIcon icon={FileUploadIcon} className={cn("text-muted-foreground", inputs.length ? "size-5" : "size-8")} aria-hidden="true" />
            <strong className={inputs.length ? "flex-1 text-left" : "text-[15px]"}>영상·사진 넣기</strong>
            {inputs.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{inputs.length} / 20</span>}
          </Button>}
          {(inputs.length > 0 || busy) && <ol aria-label="넣은 미디어" className="shrink-0 overflow-hidden rounded-[10px] border border-border">
            {inputs.map((input, index) => <li key={input.id} draggable={!busy} className="flex h-20 items-center gap-3 border-b border-border bg-background pr-3 pl-2 last:border-b-0"
              onDragStart={event => { event.dataTransfer.setData("application/x-u3-input-index", String(index)); event.dataTransfer.effectAllowed = "move"; }}
              onDragOver={event => { if (event.dataTransfer.types.includes("application/x-u3-input-index")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
              onDrop={event => {
                const value = event.dataTransfer.getData("application/x-u3-input-index");
                if (!value) return;
                event.preventDefault(); event.stopPropagation(); void reorder(Number(value), index);
              }}>
              <HugeiconsIcon icon={DragDropVerticalIcon} aria-hidden="true" className="size-4 shrink-0 text-placeholder" />
              <strong className="w-4 shrink-0 text-center tabular-nums">{index + 1}</strong>
              <span className="h-16 w-9 shrink-0 overflow-hidden rounded-sm bg-muted">{mediaUrls[input.id] && <img src={mediaUrls[input.id]} alt="" className="h-full w-full object-cover" />}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong className="truncate">{inputDisplayName(input)}</strong>
                <span className="text-2xs text-muted-foreground">{input.kind === "video" ? `영상${input.durationSec === undefined ? "" : ` · ${input.durationSec.toFixed(1)}초`}` : "사진"}</span>
              </div>
              <FlowIconButton size="icon-sm" label={`위로 이동 ${inputDisplayName(input)}`} disabled={busy || index === 0} onClick={() => void reorder(index, index - 1)}><HugeiconsIcon icon={ArrowUp01Icon} aria-hidden="true" /></FlowIconButton>
              <FlowIconButton size="icon-sm" label={`아래로 이동 ${inputDisplayName(input)}`} disabled={busy || index === inputs.length - 1} onClick={() => void reorder(index, index + 1)}><HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" /></FlowIconButton>
              <FlowIconButton size="icon-sm" label={`빼기 ${inputDisplayName(input)}`} disabled={busy} onClick={() => void removeInput(input.id)}><HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" /></FlowIconButton>
            </li>)}
            {busy && <li className="flex h-20 items-center gap-3 px-16" aria-hidden="true"><div className="h-16 w-9 animate-pulse rounded-sm bg-muted" /><div className="flex flex-col gap-1.5"><div className="h-3 w-36 animate-pulse rounded bg-muted" /><div className="h-2.5 w-20 animate-pulse rounded bg-muted" /></div></li>}
          </ol>}
        </div>
      </main>
    </section>
  );
}
