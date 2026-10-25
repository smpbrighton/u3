import { useEffect, useRef, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AttachmentField } from "../../../seed-design/ui/attachment-field";
import { ActionButton } from "../../../seed-design/ui/action-button";
import type { Project } from "../../core/schema";
import { api, mediaUrl } from "../api";
import { Recorder } from "./Recorder";
import { inputDisplayName } from "../../core/input";
import { MEME_PAGE_SIZE, pageMemes } from "./library-window";
import { createLatestRequestGuard, debounceSearch } from "./library-request";

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
  const [memeQuery, setMemeQuery] = useState("");
  const [sfxQuery, setSfxQuery] = useState("");
  const [memePage, setMemePage] = useState(1);
  const [memes, setMemes] = useState<MemeItem[]>([]);
  const [sfxItems, setSfxItems] = useState<SfxItem[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const memeRequests = useRef(createLatestRequestGuard());
  const sfxRequests = useRef(createLatestRequestGuard());

  useEffect(() => {
    let active = true;
    if (tab === "media") {
      void Promise.all(props.project.inputs.map(async (input) => [input.id, input.kind === "video"
        ? (await api<{ url: string }>("GET", `/api/projects/${props.project.id}/inputs/${encodeURIComponent(input.id)}/thumbnail`)).url
        : await mediaUrl(props.project.id, input.file)] as const)).then((urls) => {
        if (active) setMediaUrls(Object.fromEntries(urls));
      }).catch((error) => props.onError(error instanceof Error ? error.message : String(error)));
    }
    return () => { active = false; };
  }, [props.onError, props.project.id, props.project.inputs, tab]);

  useEffect(() => {
    const request = memeRequests.current.next();
    if (tab !== "meme") return;
    let active = true;
    const search = debounceSearch((query) => {
      const params = new URLSearchParams({ limit: String(MEME_PAGE_SIZE), offset: String((memePage - 1) * MEME_PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      void api<MemeItem[]>("GET", `/api/library/memes?${params}`).then((items) => {
        if (!active || !memeRequests.current.isCurrent(request)) return;
        setMemes((current) => memePage === 1 ? items : [...current, ...items]);
      }).catch((error) => { if (active) props.onError(error instanceof Error ? error.message : String(error)); });
    }, 250);
    search(memeQuery);
    return () => { active = false; search.cancel(); };
  }, [memePage, memeQuery, props.onError, tab]);

  useEffect(() => {
    const request = sfxRequests.current.next();
    if (tab !== "sfx") return;
    let active = true;
    const search = debounceSearch((query) => {
      const params = new URLSearchParams(query.trim() ? { q: query.trim() } : {}).toString();
      void api<SfxItem[]>("GET", `/api/library/sfx${params ? `?${params}` : ""}`).then((items) => {
        if (active && sfxRequests.current.isCurrent(request)) setSfxItems(items);
      }).catch((error) => { if (active) props.onError(error instanceof Error ? error.message : String(error)); });
    }, 250);
    search(sfxQuery);
    return () => { active = false; search.cancel(); };
  }, [props.onError, sfxQuery, tab]);

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

  function searchMemes(query: string) {
    memeRequests.current.next();
    setMemes([]);
    setMemePage(1);
    setMemeQuery(query);
  }

  function searchSfx(query: string) {
    sfxRequests.current.next();
    setSfxItems([]);
    setSfxQuery(query);
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
        <input className="studio-search" aria-label="짤 검색" placeholder="짤 검색" value={memeQuery} onChange={(event) => searchMemes(event.currentTarget.value)} />
        <div className="studio-library-grid">{Array.from({ length: memePage }, (_, index) => pageMemes(memes, index + 1)).flat().map((meme) => <button key={meme.id} type="button" draggable onDragStart={(event) => drag(event, "meme", meme.id)} className={props.selectedId === meme.id ? "is-selected" : ""} onClick={() => props.onSelectMeme(meme)} title={meme.description ?? meme.id}>
          <MemePreview url={meme.url} /><span>{meme.description ?? meme.emotion}</span>
        </button>)}</div>
        {memes.length === memePage * MEME_PAGE_SIZE ? <button type="button" className="studio-library-more" onClick={() => setMemePage((page) => page + 1)}>더 보기</button> : null}
      </> : null}
      {tab === "sfx" ? <>
        <input className="studio-search" aria-label="효과음 검색" placeholder="효과음 검색" value={sfxQuery} onChange={(event) => searchSfx(event.currentTarget.value)} />
        <ul className="studio-library-list">{sfxItems.map((item) => <li key={item.id} draggable onDragStart={(event) => drag(event, "sfx", item.id)}><button type="button" className="studio-library-choice" onClick={() => props.onAddSfx(item)}><span>♫</span><span><b>{item.title}</b><small>{item.category} · {item.durationSec.toFixed(1)}초</small></span></button></li>)}</ul>
      </> : null}
      {tab === "voice" ? <Recorder projectId={props.project.id} clips={props.project.timeline.voice} onAdd={props.onAddVoice} onRecordingChange={props.onRecordingChange} onError={props.onError} onSnackbar={props.onSnackbar} /> : null}
    </div>
  </aside>;
}

function MemePreview({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return <video ref={ref} src={visible ? url : undefined} muted preload="none" />;
}
