import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AttachmentField } from "../../../seed-design/ui/attachment-field";
import { ActionButton } from "../../../seed-design/ui/action-button";
import type { Project } from "../../core/schema";
import { api, mediaUrl } from "../api";
import { Recorder } from "./Recorder";
import { inputDisplayName } from "../../core/input";
import { MEME_PAGE_SIZE, canMemePreviewPlay, memePageHasMore, mergeMemePages, memePreviewPreload, memePreviewSource, releaseMemePreview, shouldLoadMemePage, shouldRequestMemePage } from "./library-window";
import { createAbortableRequestGuard, debounceSearch } from "./library-request";
import { decidePointerDrag } from "./library-drop";

type Tab = "media" | "meme" | "sfx" | "voice";
interface MemeItem { id: string; emotion: string; situations: string[]; description?: string; durationSec?: number; url: string }
interface SfxItem { id: string; category: string; title: string; file: string; ref: string; url: string; durationSec: number }
export type LibraryDragItem = { type: "video"; id: string; label: string; image?: string } | { type: "meme"; id: string; label: string; image: string; meme: MemeItem } | { type: "sfx"; id: string; label: string; sfx: SfxItem };

export function LibraryPanel(props: {
  project: Project;
  selectedId: string | null;
  onAddVideo: (inputId: string) => void;
  onSelectMeme: (meme: MemeItem) => void;
  onAddSfx: (sfx: SfxItem) => void;
  onPointerDrop: (item: LibraryDragItem, clientX: number, clientY: number) => void;
  onPointerMove: (clientX: number, clientY: number) => void;
  onPointerCancel: () => void;
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
  const [memeLoading, setMemeLoading] = useState(false);
  const [memeSearchStatus, setMemeSearchStatus] = useState<"idle" | "searching" | "judging" | "jev" | "fallback" | "search-error">("idle");
  const [memeHasMore, setMemeHasMore] = useState(true);
  const [hoveredMemeId, setHoveredMemeId] = useState<string | null>(null);
  const [sfxItems, setSfxItems] = useState<SfxItem[]>([]);
  const [sfxSearchStatus, setSfxSearchStatus] = useState<"idle" | "searching" | "judging" | "jev" | "fallback" | "search-error">("idle");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pointerDrag, setPointerDrag] = useState<{ item: LibraryDragItem; x: number; y: number } | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; item: LibraryDragItem; dragging: boolean } | null>(null);
  const dropHandler = useRef(props.onPointerDrop);
  const moveHandler = useRef(props.onPointerMove);
  const cancelHandler = useRef(props.onPointerCancel);
  dropHandler.current = props.onPointerDrop;
  moveHandler.current = props.onPointerMove;
  cancelHandler.current = props.onPointerCancel;
  const suppressClick = useRef(false);
  const memeSituationRequests = useRef(createAbortableRequestGuard());
  const sfxRequests = useRef(createAbortableRequestGuard());
  const memePageGeneration = useRef(0);
  const loadedMemePages = useRef(new Set<number>());
  const inFlightMemePages = useRef(new Set<string>());
  const memeLoadingRef = useRef(false);
  const memeHasMoreRef = useRef(true);
  const libraryContentRef = useRef<HTMLDivElement>(null);
  const memeEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.dragging && decidePointerDrag({ startX: current.x, startY: current.y, currentX: event.clientX, currentY: event.clientY }).kind === "drag") {
        current.dragging = true;
        document.body.classList.add("studio-library-pointer-dragging");
      }
      if (current.dragging) {
        event.preventDefault();
        setPointerDrag({ item: current.item, x: event.clientX, y: event.clientY });
        moveHandler.current(event.clientX, event.clientY);
      }
    };
    const finish = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      gesture.current = null;
      if (current.dragging) {
        event.preventDefault();
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 0);
        document.body.classList.remove("studio-library-pointer-dragging");
        setPointerDrag(null);
        cancelHandler.current();
        dropHandler.current(current.item, event.clientX, event.clientY);
      }
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !gesture.current?.dragging) return;
      gesture.current = null;
      document.body.classList.remove("studio-library-pointer-dragging");
      setPointerDrag(null);
      cancelHandler.current();
    };
    const cancelPointer = (event: PointerEvent) => {
      if (!gesture.current || gesture.current.id !== event.pointerId) return;
      gesture.current = null;
      document.body.classList.remove("studio-library-pointer-dragging");
      setPointerDrag(null);
      cancelHandler.current();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("keydown", cancel);
      document.body.classList.remove("studio-library-pointer-dragging");
    };
  }, []);

  function beginPointerDrag(event: ReactPointerEvent, item: LibraryDragItem) {
    if (event.button !== 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* window listeners still track the gesture */ }
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, item, dragging: false };
  }

  function clickUnlessDragging(event: MouseEvent, action: () => void) {
    if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); return; }
    action();
  }

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
    const request = memeSituationRequests.current.begin();
    if (tab === "meme" && memeQuery.trim()) {
      const query = memeQuery.trim();
      let started = false;
      setMemeLoading(true);
      setMemeSearchStatus("searching");
      const search = debounceSearch((text) => {
        started = true;
        void api<{ items: MemeItem[]; by: "search" | "rule" }>("POST", "/api/library/memes/search", { q: text }, request.signal).then(async (result) => {
          if (!request.isCurrent()) return;
          setMemes(result.items);
          setMemeLoading(false);
          if (!result.items.length) { setMemeSearchStatus("idle"); return; }
          setMemeSearchStatus("judging");
          try {
            const judged = await api<{ items: { id: string; fit: number }[] }>("POST", "/api/library/memes/judge", { q: text, ids: result.items.map(item => item.id), projectId: props.project.id }, request.signal);
            if (!request.isCurrent()) return;
            const byId = new Map(result.items.map(item => [item.id, item]));
            setMemes(judged.items.flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : []));
            setMemeSearchStatus("jev");
          } catch (error) {
            if (!request.isCurrent()) return;
            setMemeSearchStatus("fallback");
          }
        }).catch((error) => {
          if (!request.isCurrent()) return;
          setMemeSearchStatus("search-error");
          props.onError(error instanceof Error ? error.message : String(error));
        }).finally(() => {
          if (request.isCurrent()) setMemeLoading(false);
        });
      }, 400);
      search(query);
      return () => {
        search.cancel();
        if (!started && request.isCurrent()) setMemeLoading(false);
      };
    }
    setMemeSearchStatus("idle");
    if (tab !== "meme") setMemeLoading(false);
    if (tab !== "meme" || !memeHasMoreRef.current || !shouldLoadMemePage([...loadedMemePages.current], memePage)) return;
    const generation = memePageGeneration.current;
    const requestKey = `${generation}:${memePage}`;
    if (inFlightMemePages.current.has(requestKey)) return;
    inFlightMemePages.current.add(requestKey);
    memeLoadingRef.current = true;
    setMemeLoading(true);
    let requested = false;
    const search = debounceSearch((query) => {
      requested = true;
      const params = new URLSearchParams({ limit: String(MEME_PAGE_SIZE), offset: String((memePage - 1) * MEME_PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      void api<MemeItem[]>("GET", `/api/library/memes?${params}`).then((items) => {
        if (generation !== memePageGeneration.current) return;
        loadedMemePages.current.add(memePage);
        const hasMore = memePageHasMore(items.length);
        memeHasMoreRef.current = hasMore;
        setMemeHasMore(hasMore);
        setMemes((current) => mergeMemePages(current, items, memePage));
      }).catch((error) => { if (generation === memePageGeneration.current) props.onError(error instanceof Error ? error.message : String(error)); }).finally(() => {
        inFlightMemePages.current.delete(requestKey);
        if (generation === memePageGeneration.current) {
          memeLoadingRef.current = false;
          setMemeLoading(false);
        }
      });
    }, 250);
    search(memeQuery);
    return () => {
      search.cancel();
      if (requested) return;
      if (!inFlightMemePages.current.has(requestKey)) return;
      inFlightMemePages.current.delete(requestKey);
      if (generation === memePageGeneration.current) {
        memeLoadingRef.current = false;
        setMemeLoading(false);
      }
    };
  }, [memePage, memeQuery, props.onError, props.project.id, tab]);

  useEffect(() => {
    if (tab !== "meme" || memeQuery.trim() || !memeEndRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (!shouldRequestMemePage({ reachedEnd: true, loading: memeLoadingRef.current, hasMore: memeHasMoreRef.current })) return;
      memeLoadingRef.current = true;
      setMemeLoading(true);
      setMemePage((page) => page + 1);
    }, { root: libraryContentRef.current });
    observer.observe(memeEndRef.current);
    return () => observer.disconnect();
  }, [memeHasMore, memeLoading, memePage, memeQuery, memes.length, tab]);

  useEffect(() => {
    const request = sfxRequests.current.begin();
    if (tab !== "sfx") return;
    const query = sfxQuery.trim();
    setSfxSearchStatus(query ? "searching" : "idle");
    const search = debounceSearch((term) => {
      setSfxSearchStatus("searching");
      const requestPath = term ? "/api/library/sfx/search" : "/api/library/sfx";
      const body = term ? { q: term } : undefined;
      type SearchResult = { items: SfxItem[]; by: "rule" };
      type ApiResult = SearchResult | SfxItem[];
      const payload = term
        ? api<SearchResult>("POST", requestPath, body, request.signal)
        : api<SfxItem[]>("GET", requestPath, undefined, request.signal);
      void payload.then(async (result: ApiResult) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(result) ? result : result.items;
        setSfxItems(items);
        if (!term || !items.length) { setSfxSearchStatus("idle"); return; }
        setSfxSearchStatus("judging");
        try {
          const judged = await api<{ items: { id: string; fit: number }[] }>("POST", "/api/library/sfx/judge", { q: term, ids: items.map(item => item.id), projectId: props.project.id }, request.signal);
          if (!request.isCurrent()) return;
          const byId = new Map(items.map(item => [item.id, item]));
          setSfxItems(judged.items.flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : []));
          setSfxSearchStatus("jev");
        } catch {
          if (request.isCurrent()) setSfxSearchStatus("fallback");
        }
      }).catch((error) => {
        if (request.isCurrent()) {
          setSfxSearchStatus("search-error");
          props.onError(error instanceof Error ? error.message : String(error));
        }
      });
    }, 400);
    search(query);
    return () => search.cancel();
  }, [props.onError, props.project.id, sfxQuery, tab]);

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

  function searchMemes(query: string) {
    memeSituationRequests.current.begin();
    memePageGeneration.current += 1;
    loadedMemePages.current.clear();
    inFlightMemePages.current.clear();
    memeLoadingRef.current = false;
    memeHasMoreRef.current = true;
    setMemeLoading(false);
    setMemeHasMore(true);
    setMemes([]);
    setMemePage(1);
    setHoveredMemeId(null);
    setMemeQuery(query);
  }

  function searchSfx(query: string) {
    sfxRequests.current.begin();
    setSfxItems([]);
    setSfxQuery(query);
  }

  return <aside className="studio-library" aria-label="라이브러리">
    <div className="studio-library-tabs" role="tablist" aria-label="라이브러리 종류">
      {([["media", "미디어"], ["meme", "짤"], ["sfx", "효과음"], ["voice", "음성"]] as [Tab, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="studio-library-content" ref={libraryContentRef}>
      {tab === "media" ? <>
        <AttachmentField label="미디어 넣기" description="영상·사진을 영상 트랙에 끌어 놓으세요." accept={["video/mp4", "video/quicktime", "image/*"]}>
          <div className="studio-attachment" onClick={() => void chooseMedia()}><ActionButton variant="neutralWeak" loading={busy}>미디어 넣기</ActionButton><span>영상·사진 파일을 선택해요.</span></div>
        </AttachmentField>
        <ul className="studio-library-list">{props.project.inputs.filter((input) => input.id !== "placeholder").map((input) => <li key={input.id}>
          <button type="button" className="studio-media-item" onPointerDown={(event) => beginPointerDrag(event, { type: "video", id: input.id, label: inputDisplayName(input), image: mediaUrls[input.id] })} onClick={(event) => clickUnlessDragging(event, () => props.onAddVideo(input.id))}>
            <span className="studio-media-thumb"><img src={mediaUrls[input.id]} alt="" /></span>
            <span><b>{inputDisplayName(input)}</b><small>{input.kind === "video" ? "영상" : "사진"}{input.durationSec ? ` · ${input.durationSec.toFixed(1)}초` : ""}</small></span>
          </button>
        </li>)}</ul>
      </> : null}
      {tab === "meme" ? <>
        <input className="studio-search" aria-label="짤 검색" placeholder="짤 검색" value={memeQuery} onChange={(event) => searchMemes(event.currentTarget.value)} />
        {memeSearchStatus === "judging" ? <span role="status">Jev가 고르는 중…</span> : null}
        {memeSearchStatus === "fallback" ? <span role="status">Jev 추천을 쓸 수 없어 검색 순서로 보여요</span> : null}
        <div className="studio-library-grid">{memes.map((meme) => <button key={meme.id} type="button" onPointerDown={(event) => beginPointerDrag(event, { type: "meme", id: meme.id, label: meme.description ?? meme.emotion, image: meme.url, meme })} className={props.selectedId === meme.id ? "is-selected" : ""} onMouseEnter={() => setHoveredMemeId(meme.id)} onMouseLeave={() => setHoveredMemeId((id) => id === meme.id ? null : id)} onClick={(event) => clickUnlessDragging(event, () => props.onSelectMeme(meme))} title={meme.description ?? meme.id}>
          <MemePreview url={meme.url} id={meme.id} hoveredId={hoveredMemeId} /><span>{meme.description ?? meme.emotion}</span>
        </button>)}</div>
        <div ref={memeEndRef} className="studio-library-end" aria-hidden="true" />
        {memeLoading && memeSearchStatus === "idle" ? <span role="status">짤을 불러오는 중…</span> : null}
        {memeSearchStatus === "jev" ? <span role="status">Jev 추천</span> : null}
        {memeQuery.trim() && !memeLoading && memeSearchStatus === "idle" && !memes.length ? <span role="status">맞는 짤이 없어요. 다른 상황이나 감정으로 찾아 보세요</span> : null}
      </> : null}
      {tab === "sfx" ? <>
        <input className="studio-search" aria-label="효과음 검색" placeholder="효과음 검색" value={sfxQuery} onChange={(event) => searchSfx(event.currentTarget.value)} />
        {sfxSearchStatus === "judging" ? <span role="status">Jev가 고르는 중…</span> : null}
        {sfxSearchStatus === "fallback" ? <span role="status">Jev 추천을 쓸 수 없어 검색 순서로 보여요</span> : null}
        <ul className="studio-library-list">{sfxItems.map((item) => <li key={item.id}><button type="button" className="studio-library-choice" onPointerDown={(event) => beginPointerDrag(event, { type: "sfx", id: item.id, label: item.title, sfx: item })} onClick={(event) => clickUnlessDragging(event, () => props.onAddSfx(item))}><span>♫</span><span><b>{item.title}</b><small>{item.category} · {item.durationSec.toFixed(1)}초</small></span></button></li>)}</ul>
        {sfxSearchStatus === "jev" ? <span role="status">Jev 추천</span> : null}
        {sfxQuery.trim() && !["searching", "judging", "search-error"].includes(sfxSearchStatus) && !sfxItems.length ? <span role="status">맞는 효과음이 없어요</span> : null}
      </> : null}
      {tab === "voice" ? <Recorder projectId={props.project.id} clips={props.project.timeline.voice} onAdd={props.onAddVoice} onRecordingChange={props.onRecordingChange} onError={props.onError} onSnackbar={props.onSnackbar} /> : null}
    </div>
    {pointerDrag ? <div className="studio-pointer-drag-preview" style={{ left: pointerDrag.x + 14, top: pointerDrag.y + 14 }}>{pointerDrag.item.type === "meme" ? <video src={pointerDrag.item.image} muted autoPlay loop playsInline /> : <span>{pointerDrag.item.type === "sfx" ? "♫ " : ""}{pointerDrag.item.label}</span>}</div> : null}
  </aside>;
}

function MemePreview({ id, url, hoveredId }: { id: string; url: string; hoveredId: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const playing = canMemePreviewPlay(id, hoveredId, visible);
  const wasVisible = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible && wasVisible.current && ref.current) releaseMemePreview(ref.current);
    wasVisible.current = visible;
  }, [visible]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) {
      void video.play().catch(() => {});
    } else {
      video.pause();
      if (video.readyState > 0) video.currentTime = 0;
    }
  }, [playing]);

  return <video
    ref={ref}
    src={memePreviewSource(url, visible)}
    muted
    playsInline
    loop
    preload={memePreviewPreload(visible)}
    onLoadedMetadata={(event) => {
      if (!playing) event.currentTarget.currentTime = Math.min(0.01, event.currentTarget.duration || 0.01);
    }}
    onSeeked={(event) => {
      if (!playing && event.currentTarget.currentTime !== 0) event.currentTarget.currentTime = 0;
    }}
  />;
}
