import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import type { CodexScript, MemeMeta, SfxMeta, Timeline } from "../../core/schema";
import { plainCaptionText } from "../../core/captions";
import { insertSceneMeme, insertSceneSfx, removeSceneMeme, removeSceneSfx, replaceSceneMeme, replaceSceneSfx, sceneClips, usedMemeIds } from "../../core/timeline/scene-review";
import { videoDuration } from "../../core/timeline/ops";
import { api } from "../api";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";


type Meme = MemeMeta & { url: string };
type Sfx = SfxMeta & { ref: string; url: string };
export function sceneMemeRankRequest(timeline: Timeline, scene: CodexScript["scenes"][number]) {
  const caption = plainCaptionText(scene.caption);
  return { caption, reaction: scene.reaction, query: scene.reaction || caption, excludeIds: [...usedMemeIds(timeline)] };
}
function ChoicesPopover(p: { trigger: ReactNode; label: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Popover.Root open={p.open} onOpenChange={p.onOpenChange}><Popover.Trigger asChild>{p.trigger}</Popover.Trigger><Popover.Portal><Popover.Content aria-label={p.label} side="right" align="start" sideOffset={8} className="u3-shell z-50 flex max-h-96 w-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-foreground shadow-lg">{p.children}</Popover.Content></Popover.Portal></Popover.Root>;
}
export function SceneMemeChoices(p: { timeline: Timeline; script: CodexScript; sceneIndex: number; clipId?: string; candidates: Meme[]; onChange: (timeline: Timeline) => void; onClose: () => void; onMore: () => void }) {
  const apply = (next: Timeline) => { p.onChange(next); p.onClose(); };
  return <><strong className="text-xs">다른 짤</strong><div className="grid grid-cols-3 gap-1.5">{p.candidates.filter(m => !usedMemeIds(p.timeline, p.clipId).has(m.id)).slice(0, 5).map(m => <Button key={m.id} aria-label={`짤 ${m.id}`} variant="ghost" className="h-16 overflow-hidden p-0" title={m.description ?? m.emotion} onClick={() => apply(p.clipId ? replaceSceneMeme(p.timeline, p.script, p.sceneIndex, p.clipId, m) : insertSceneMeme(p.timeline, p.script, p.sceneIndex, m))}><video className="h-full w-full object-cover" src={m.url} muted loop playsInline preload="metadata" onMouseEnter={e => { void e.currentTarget.play().catch(() => undefined); }} onMouseLeave={e => { e.currentTarget.pause(); }} /></Button>)}</div>{!p.candidates.length && <p className="text-xs text-muted-foreground">맞는 짤이 없어요</p>}<div className="flex justify-between"><Button variant="ghost" size="xs" onClick={p.onMore}>더 보기</Button>{p.clipId && <Button variant="ghost" size="xs" className="text-u3-danger-text" onClick={() => apply(removeSceneMeme(p.timeline, p.sceneIndex, p.clipId!))}>빼기</Button>}</div></>;
}
export function SceneSfxChoices(p: { timeline: Timeline; script: CodexScript; sceneIndex: number; clipId?: string; items: Sfx[]; onChange: (timeline: Timeline) => void; onClose: () => void }) {
  const category = p.script.scenes[p.sceneIndex]?.sfxCategory;
  const [all, setAll] = useState(!p.clipId || !category);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);
  const apply = (next: Timeline) => { p.onChange(next); p.onClose(); };
  return <><div className="flex items-center justify-between"><strong className="text-xs">효과음 바꾸기</strong><label className="flex items-center gap-2 text-xs">전체<Switch aria-label="전체" checked={all} onCheckedChange={setAll} /></label></div>{p.items.filter(i => all || i.category === category).map(item => <div key={item.id} className="flex items-center gap-1"><Button size="icon-xs" variant="ghost" aria-label={`${item.title} 미리 듣기`} title="미리 듣기" onClick={() => { audio.current?.pause(); audio.current = new Audio(item.url); void audio.current.play().catch(() => undefined); }}>▶</Button><Button className="min-w-0 flex-1 justify-start px-1 text-xs" variant="ghost" onClick={() => apply(p.clipId ? replaceSceneSfx(p.timeline, p.sceneIndex, p.clipId, { ...item, file: item.ref }, videoDuration(p.timeline)) : insertSceneSfx(p.timeline, p.script, p.sceneIndex, { ...item, file: item.ref }))}><span className="truncate">{item.title}</span><span className="ml-auto text-muted-foreground">{item.durationSec.toFixed(1)}초</span></Button></div>)}{p.clipId && <Button variant="ghost" size="xs" className="self-end text-u3-danger-text" onClick={() => apply(removeSceneSfx(p.timeline, p.sceneIndex, p.clipId!))}>끄기</Button>}</>;
}
export function SceneReview(p: { projectId: string; timeline: Timeline; script: CodexScript | null; onChange: (timeline: Timeline) => void; onSeek: (sec: number) => void; onMore: () => void; onError: (message: string) => void }) {
  const latest = useRef(p.timeline);
  latest.current = p.timeline;
  const [thumbnails, setThumbnails] = useState<Record<string, Meme>>({});
  const [inserting, setInserting] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Meme[]>([]);
  const [items, setItems] = useState<Sfx[]>([]);
  const [loading, setLoading] = useState(false);
  const [by, setBy] = useState("검색 순위");
  const request = useRef(0);
  const insertRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { insertRequest.current?.abort(); }, [p.projectId]);
  useEffect(() => { let active = true; void api<Sfx[]>("GET", "/api/library/sfx").then(i => { if (active) setItems(i); }).catch(e => { if (active) p.onError(String(e)); }); return () => { active = false; }; }, [p.projectId]);
  const memeIds = [...usedMemeIds(p.timeline)].sort().join("\n");
  useEffect(() => { let active = true; void Promise.all(memeIds.split("\n").filter(Boolean).map(async id => { const list = await api<Meme[]>("GET", `/api/library/memes?q=${encodeURIComponent(id)}`); return list.find(m => m.id === id); })).then(list => { if (active) setThumbnails(Object.fromEntries(list.filter((m): m is Meme => Boolean(m)).map(m => [m.id, m]))); }).catch(e => { if (active) p.onError(String(e)); }); return () => { active = false; }; }, [p.projectId, memeIds]);
  async function insertFirstMeme(index: number) {
    if (!p.script || inserting !== null) return;
    const controller = new AbortController();
    insertRequest.current = controller;
    setInserting(index);
    try {
      const rank = await api<{ list: { meme: MemeMeta }[] }>("POST", `/api/projects/${p.projectId}/memes/rank`, sceneMemeRankRequest(latest.current, p.script.scenes[index]!), controller.signal);
      if (controller.signal.aborted) return;
      const first = rank.list.find(c => !usedMemeIds(latest.current).has(c.meme.id));
      if (first) p.onChange(insertSceneMeme(latest.current, p.script, index, first.meme));
      else p.onError("맞는 짤이 없어요");
    } catch (e) { if (!controller.signal.aborted) p.onError(e instanceof Error ? e.message : String(e)); }
    finally { if (!controller.signal.aborted) setInserting(null); insertRequest.current = null; }
  }
  useEffect(() => { if (!open) return; const id = ++request.current; setLoading(true);
    const index = Number(open.split(":")[1]);
    if (open.startsWith("meme") && p.script) {
      void api<{ by: string; list: { meme: MemeMeta }[] }>("POST", `/api/projects/${p.projectId}/memes/rank`, sceneMemeRankRequest(p.timeline, p.script.scenes[index]!)).then(async rank => {
        const list = await Promise.all(rank.list.slice(0, 5).map(async ({ meme }) => {
          const matches = await api<Meme[]>("GET", `/api/library/memes?q=${encodeURIComponent(meme.id)}`);
          return matches.find(m => m.id === meme.id);
        }));
        if (request.current === id) { setCandidates(list.filter((m): m is Meme => Boolean(m))); setBy(rank.by === "jev" ? "Jev 순위" : "검색 순위"); }
      }).catch(e => { if (request.current === id) p.onError(String(e)); }).finally(() => { if (request.current === id) setLoading(false); });
    } else void api<Sfx[]>("GET", "/api/library/sfx").then(i => { if (request.current === id) setItems(i); }).catch(e => { if (request.current === id) p.onError(String(e)); }).finally(() => { if (request.current === id) setLoading(false); });
    return () => { request.current++; };
  }, [open, p.projectId]);
  if (!p.script) return <div data-slot="empty-state" className="py-10 text-center text-sm text-muted-foreground">대본이 없어요</div>;
  const script = p.script;
  return <div className="flex flex-col gap-1" aria-label="장면 검토">{sceneClips(p.timeline, script).map(row => {
    const scene = script.scenes[row.index]!;
    const pop = (kind: "meme" | "sfx", clipId?: string) => `${kind}:${row.index}:${clipId ?? "new"}`;
    const changeOpen = (key: string, value: boolean) => { setCandidates([]); setOpen(value ? key : null); };
    return <article key={row.index} className="rounded-md border border-transparent p-2 hover:bg-accent focus-within:border-border" aria-label={`장면 ${row.index + 1}`}>
      <Button variant="ghost" className="h-auto w-full justify-start gap-2 p-0 text-xs" onClick={() => { if (row.sec !== null) p.onSeek(row.sec); }}><span className="text-muted-foreground">{row.index + 1}</span><span className="truncate">{plainCaptionText(scene.caption)}</span><span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{row.sec === null ? "—" : row.sec.toFixed(1)}</span></Button>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{row.memes.length ? row.memes.slice(0, 2).map(({ clip, position }) => <ChoicesPopover key={clip.id} label="짤 후보" open={open === pop("meme", clip.id)} onOpenChange={v => changeOpen(pop("meme", clip.id), v)} trigger={<Button variant="outline" size="xs" className="h-9 max-w-full" title={scene.reaction ?? "보충 짤"}>{thumbnails[clip.memeId]?.url && <video aria-hidden="true" className="size-8 shrink-0 rounded-sm object-cover" src={thumbnails[clip.memeId]!.url} preload="metadata" muted playsInline />}<span className="truncate">{position === "before" ? "앞" : "뒤"} · {scene.reaction ?? "보충 짤"}</span></Button>}><span className="text-xs text-muted-foreground">{loading ? "Jev 불러오는 중" : by}</span><SceneMemeChoices {...p} script={script} sceneIndex={row.index} clipId={clip.id} candidates={candidates} onClose={() => setOpen(null)} /></ChoicesPopover>) : <><span>짤 없음</span><Button variant="outline" size="xs" aria-label={`장면 ${row.index + 1} 짤 넣기`} disabled={inserting !== null || row.sec === null} onClick={() => void insertFirstMeme(row.index)}>넣기</Button>{inserting === row.index && <span role="status">Jev 불러오는 중</span>}</>}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{row.sfx.length ? row.sfx.map(clip => <ChoicesPopover key={clip.id} label="효과음 목록" open={open === pop("sfx", clip.id)} onOpenChange={v => changeOpen(pop("sfx", clip.id), v)} trigger={<Button variant="ghost" size="xs" className="max-w-full truncate">♫ {items.find(i => i.ref === clip.file)?.title ?? clip.file.split("/").at(-1)} {scene.sfxCategory}</Button>}>{loading ? <span role="status">불러오는 중</span> : <SceneSfxChoices {...p} script={script} sceneIndex={row.index} clipId={clip.id} items={items} onClose={() => setOpen(null)} />}</ChoicesPopover>) : <><span>효과음 없음</span><ChoicesPopover label="효과음 목록" open={open === pop("sfx")} onOpenChange={v => changeOpen(pop("sfx"), v)} trigger={<Button variant="outline" size="xs" aria-label={`장면 ${row.index + 1} 효과음 넣기`}>넣기</Button>}>{loading ? <span role="status">불러오는 중</span> : <SceneSfxChoices {...p} script={script} sceneIndex={row.index} items={items} onClose={() => setOpen(null)} />}</ChoicesPopover></>}</div>
    </article>;
  })}</div>;
}
