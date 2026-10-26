import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { ChipTabsList, ChipTabsRoot, ChipTabsTrigger } from "../../../seed-design/ui/chip-tabs";
import { TextField, TextFieldInput } from "../../../seed-design/ui/text-field";
import { api, mediaUrl } from "../api";
import type { Input as ProjectInput, Project } from "../types";
import { inputDisplayName } from "../../core/input";
import { ArrowLeft01Icon, ArrowUp01Icon, ArrowDown01Icon, FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  const unlisten = useRef<(() => void) | null>(null);
  const inputs = props.project.inputs.filter(input => input.id !== "placeholder");

  useEffect(() => {
    let active = true;
    void Promise.all(inputs.map(async input => [input.id, input.kind === "video"
      ? (await api<{ url: string }>("GET", `/api/projects/${props.project.id}/inputs/${input.id}/thumbnail`)).url
      : await mediaUrl(props.project.id, input.file)] as const))
      .then(entries => { if (active) setMediaUrls(Object.fromEntries(entries)); });
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
    const available = 20 - inputs.length;
    const accepted = paths.filter(file => mediaKind(file)).slice(0, available);
    if (!accepted.length) {
      props.onError(available ? "mp4·mov 영상이나 jpg·png·heic 사진을 골라 주세요." : "미디어는 20개까지 넣을 수 있어요.");
      return;
    }
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
      setBusy(false);
    }
  }

  async function persistName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === props.project.name) return props.project;
    const next = await api<Project>("PUT", `/api/projects/${props.project.id}`, { ...props.project, name: trimmed, savedAt: new Date().toISOString() });
    props.onProject(next);
    return next;
  }

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
    const remaining = inputs.filter(input => input.id !== inputId);
    const next = {
      ...props.project,
      inputs: remaining.length ? remaining : [{ id: "placeholder", kind: "photo" as const, file: "pending" }],
      savedAt: new Date().toISOString(),
    };
    try {
      const saved = await api<Project>("PUT", `/api/projects/${next.id}`, next);
      props.onProject(saved);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function reorder(from: number, to: number) {
    if (to < 0 || to >= inputs.length || from === to) return;
    const reordered = [...inputs];
    const [item] = reordered.splice(from, 1);
    if (item) reordered.splice(to, 0, item);
    try {
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
    <section className="screen input-screen" aria-label="미디어 넣기">
      <header className="input-header">
        <ActionButton className="flow-back-button" variant="ghost" aria-label="영상 목록으로 돌아가기" onClick={props.onBack}><HugeiconsIcon icon={ArrowLeft01Icon} size={20} /></ActionButton>
        <div className="project-name-input">
          <TextField aria-label="영상 이름" value={name} onValueChange={values => setName(values.value)}><TextFieldInput maxLength={120} /></TextField>
        </div>
        <ChipTabsRoot className="steps" value="media" size="medium" variant="neutralSolid" aria-label="단계" onValueChange={value => {
          if (value === "script") props.onScript();
          if (value === "studio") props.onStudio();
        }}>
          <ChipTabsList>
            <ChipTabsTrigger value="media">1 미디어</ChipTabsTrigger>
            <ChipTabsTrigger value="script" disabled={!inputs.length}>2 대본</ChipTabsTrigger>
            <ChipTabsTrigger value="studio" disabled={!props.project.timeline.video.length}>3 스튜디오</ChipTabsTrigger>
          </ChipTabsList>
        </ChipTabsRoot>
      </header>
      <main className="input-content">
        <ActionButton
          variant="neutralOutline"
          className="drop-area"
          type="button"
          disabled={busy || inputs.length >= 20}
          data-dragging={dragging}
          onClick={() => void chooseFiles()}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); void addPaths(Array.from(event.dataTransfer.files).map(file => (file as File & { path?: string }).path).filter((file): file is string => Boolean(file))); }}
        >
          <HugeiconsIcon icon={FileUploadIcon} size={32} aria-hidden="true" />
          <span className="drop-area-title">영상·사진을 끌어 놓거나 눌러서 고르기</span>
          <span className="drop-area-description">mp4 · mov · jpg · png · heic, 최대 20개</span>
        </ActionButton>
        <section className="input-media-section" aria-labelledby="media-list-title">
          <div className="input-media-heading">
            <h2 id="media-list-title">넣은 미디어</h2><span>{inputs.length} / 20</span>
          </div>
          {inputs.length ? (
            <ol className="media-list">
              {inputs.map((input, index) => (
                <li className="media-row" key={input.id} draggable onDragStart={event => event.dataTransfer.setData("text/plain", String(index))} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void reorder(Number(event.dataTransfer.getData("text/plain")), index); }}>
                  <span className="media-preview"><img src={mediaUrls[input.id]} alt="" /></span>
                  <span className="media-kind">{index + 1}</span>
                  <span className="media-row-name">{inputDisplayName(input)}</span>
                  <span className="media-kind">{input.kind === "video" ? "영상" : "사진"}</span>
                  <ActionButton variant="neutralWeak" size="small" aria-label={`위로 이동 ${inputDisplayName(input)}`} disabled={index === 0} onClick={() => void reorder(index, index - 1)}><HugeiconsIcon icon={ArrowUp01Icon} size={16} /></ActionButton>
                  <ActionButton variant="neutralWeak" size="small" aria-label={`아래로 이동 ${inputDisplayName(input)}`} disabled={index === inputs.length - 1} onClick={() => void reorder(index, index + 1)}><HugeiconsIcon icon={ArrowDown01Icon} size={16} /></ActionButton>
                  <ActionButton variant="ghost" size="small" aria-label={`빼기 ${inputDisplayName(input)}`} onClick={() => void removeInput(input.id)}>빼기</ActionButton>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </main>
      <footer className="input-footer">
        <ActionButton variant="brandSolid" disabled={!inputs.length || busy} onClick={() => void next()}>다음: 대본</ActionButton>
      </footer>
    </section>
  );
}
