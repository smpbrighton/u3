import { useEffect, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AttachmentField } from "../../../seed-design/ui/attachment-field";
import { ActionButton } from "../../../seed-design/ui/action-button";
import type { Project } from "../../core/schema";
import { api, mediaUrl } from "../api";
import { Recorder } from "./Recorder";
import { inputDisplayName } from "../../core/input";

type Tab = "media" | "meme" | "sfx" | "voice";
interface MemeItem { id: string; emotion: string; situations: string[]; description?: string; durationSec?: number; url: string }
interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }

export function LibraryPanel(props: {
  project: Project;
  selectedId: string | null;
  onAddVideo: (inputId: string) => void;
  onSelectMeme: (meme: MemeItem) => void;
  onAddSfx: (sfx: SfxItem) => void;
  playhead: number;
  onAddVoice: (file: string, durationSec: number) => void;
  onRecordingChange: (recording: boolean) => void;
  onProject: (project: Project) => void;
  onError: (message: string) => void;
  onSnackbar: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("media");
  const [query, setQuery] = useState("");
  const [memes, setMemes] = useState<MemeItem[]>([]);
  const [sfxItems, setSfxItems] = useState<SfxItem[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(query.trim() ? { q: query.trim() } : {}).toString();
    void Promise.all([
      api<MemeItem[]>("GET", `/api/library/memes${search ? `?${search}` : ""}`),
      api<SfxItem[]>("GET", `/api/library/sfx${search ? `?${search}` : ""}`),
      Promise.all(props.project.inputs.map(async (input) => [input.id, input.kind === "video"
        ? (await api<{ url: string }>("GET", `/api/projects/${props.project.id}/inputs/${encodeURIComponent(input.id)}/thumbnail`)).url
        : await mediaUrl(props.project.id, input.file)] as const)),
    ]).then(([nextMemes, nextSfx, urls]) => {
      if (!active) return;
      setMemes(nextMemes);
      setSfxItems(nextSfx);
      setMediaUrls(Object.fromEntries(urls));
    }).catch((error) => props.onError(error instanceof Error ? error.message : String(error)));
    return () => { active = false; };
  }, [props.project.id, props.project.inputs, query]);

  async function chooseMedia() {
    try {
      const paths = await open({ title: "영상·사진 넣기", multiple: true, filters: [{ name: "영상과 사진", extensions: ["mp4", "mov", "m4v", "jpg", "jpeg", "png", "heic", "webp"] }] });
      const files = Array.isArray(paths) ? paths : paths ? [paths] : [];
      if (!files.length) return;
      setBusy(true);
      const added = await api<Project>("POST", `/api/projects/${props.project.id}/inputs`, { files: files.map((file) => ({ path: file, kind: /\.(mp4|mov|m4v)$/i.test(file) ? "video" : "photo" })) });
      props.onProject(added);
      props.onSnackbar("미디어를 추가했어요. 타임라인에 끌어 놓아 주세요.");
    } catch (error) { props.onError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  function drag(event: DragEvent, type: string, id: string) {
    event.dataTransfer.setData("application/u3-studio-item", JSON.stringify({ type, id }));
    event.dataTransfer.effectAllowed = "copy";
  }

  return <aside className="studio-library" aria-label="라이브러리">
    <div className="studio-library-tabs" role="tablist" aria-label="라이브러리 종류">
      {([["media", "미디어"], ["meme", "짤"], ["sfx", "효과음"], ["voice", "음성"]] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="studio-library-content">
      {tab === "media" ? <>
        <AttachmentField label="미디어 넣기" description="영상·사진을 영상 트랙에 끌어 놓으세요." accept={["video/mp4", "video/quicktime", "image/*"]}>
          <div className="studio-attachment" onClick={() => void chooseMedia()}><ActionButton variant="neutralWeak" loading={busy}>미디어 넣기</ActionButton><span>영상·사진 파일을 선택해요.</span></div>
        </AttachmentField>
        <ul className="studio-library-list">{props.project.inputs.filter((input) => input.id !== "placeholder").map((input) => <li key={input.id} draggable onDragStart={(event) => drag(event, "video", input.id)}>
          <button type="button" className="studio-media-item" onClick={() => props.onAddVideo(input.id)}>
            <span className="studio-media-thumb"><img src={mediaUrls[input.id]} alt="" /></span>
            <span><b>{inputDisplayName(input)}</b><small>{input.kind === "video" ? "영상" : "사진"}{input.durationSec ? ` · ${input.durationSec.toFixed(1)}초` : ""}</small></span>
          </button>
        </li>)}</ul>
      </> : null}
      {tab === "meme" ? <>
        <input className="studio-search" aria-label="짤 검색" placeholder="짤 검색" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <div className="studio-library-grid">{memes.map((meme) => <button key={meme.id} type="button" draggable onDragStart={(event) => drag(event, "meme", meme.id)} className={props.selectedId === meme.id ? "is-selected" : ""} onClick={() => props.onSelectMeme(meme)} title={meme.description ?? meme.id}>
          <video src={meme.url} muted preload="metadata" /><span>{meme.description ?? meme.emotion}</span>
        </button>)}</div>
      </> : null}
      {tab === "sfx" ? <>
        <input className="studio-search" aria-label="효과음 검색" placeholder="효과음 검색" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <ul className="studio-library-list">{sfxItems.map((item) => <li key={item.id} draggable onDragStart={(event) => drag(event, "sfx", item.id)}><button type="button" className="studio-library-choice" onClick={() => props.onAddSfx(item)}><span>♫</span><span><b>{item.title}</b><small>{item.category} · {item.durationSec.toFixed(1)}초</small></span></button></li>)}</ul>
      </> : null}
      {tab === "voice" ? <>
        <Recorder projectId={props.project.id} clips={props.project.timeline.voice} onAdd={props.onAddVoice} onRecordingChange={props.onRecordingChange} onError={props.onError} onSnackbar={props.onSnackbar} />
      </> : null}
    </div>
  </aside>;
}
