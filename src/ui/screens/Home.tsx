import { useEffect, useState } from "react";
import { ActionButton } from "../../../seed-design/ui/action-button";
import { PageBanner, PageBannerButton } from "../../../seed-design/ui/page-banner";
import { api, mediaUrl } from "../api";
import type { Project, SystemStatus } from "../types";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertDialog } from "@seed-design/react";

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
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    void api<Project[]>("GET", "/api/projects").then(async data => {
      setProjects(data);
      const firstInputs = data.flatMap(project => {
        const input = project.inputs.find(item => item.id !== "placeholder" && item.kind === "photo");
        return input ? [{ projectId: project.id, inputId: input.id, file: input.file }] : [];
      });
      const urls = await Promise.all(firstInputs.map(async item => [item.projectId, await mediaUrl(item.projectId, item.file)] as const));
      setThumbnails(Object.fromEntries(urls));
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const createProject = async () => {
    setError(null);
    try {
      const project = await api<Project>("POST", "/api/projects", { name: "새 영상" });
      props.onNew(project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteProject = async () => {
    if (!deleting) return;
    try {
      await api("DELETE", `/api/projects/${encodeURIComponent(deleting.id)}`);
      setProjects(current => current.filter(project => project.id !== deleting.id));
      setDeleting(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const renameProject = async () => {
    if (!editing || !name.trim()) return;
    try {
      const updated = await api<Project>("PUT", `/api/projects/${encodeURIComponent(editing.id)}`, { ...editing, name: name.trim(), savedAt: new Date().toISOString() });
      setProjects(current => current.map(project => project.id === updated.id ? updated : project));
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const codexReady = props.status?.codex.installed && props.status.codex.loggedIn;
  const codexMessage = props.status && !props.status.codex.installed
    ? "Codex CLI를 찾지 못해 대본을 만들 수 없어요."
    : props.status && !props.status.codex.loggedIn
      ? "Codex에 로그인되어 있지 않아 대본을 만들 수 없어요."
      : null;

  return (
    <section className="screen" aria-labelledby="home-title">
      <header className="screen-header">
        <div>
          <h1 id="home-title" className="screen-title">영상</h1>
        </div>
        <ActionButton variant="brandSolid" onClick={() => void createProject()}>새 영상</ActionButton>
      </header>
      {error ? <div className="page-banner-wrap" role="alert"><PageBanner tone="warning" variant="weak" description={error} /></div> : null}
      {codexMessage ? (
        <div className="page-banner-wrap">
          <PageBanner tone="warning" variant="weak" description={codexMessage} suffix={<PageBannerButton onClick={props.onSettings}>설정에서 확인</PageBannerButton>} />
        </div>
      ) : null}
      {projects.length ? (
        <div className="project-grid" aria-label="영상 목록">
          {projects.map(project => {
            const inputCount = project.inputs.filter(input => input.id !== "placeholder").length;
            const scenes = project.timeline.captions.length;
            const duration = timelineDuration(project);
            const complete = project.timeline.video.length > 0;
            return (
              <div className="project-card-wrap" key={project.id}>
              <button className="project-card" onClick={() => props.onOpen(project)}>
                <span className={thumbnails[project.id] ? "project-thumb" : `project-thumb project-thumb--empty${complete ? " project-thumb--complete" : ""}`}>
                  {thumbnails[project.id] ? <img src={thumbnails[project.id]} alt="" /> : null}
                  {!complete ? <span className="project-status">대본 전</span> : null}
                  {duration > 0 ? <span className="project-duration">{durationLabel(duration)}</span> : null}
                </span>
                <span className="project-name">{project.name}</span>
                <span className="project-meta">{scenes ? `장면 ${scenes}` : inputCount ? `미디어 ${inputCount}` : "미디어 넣기 전"} · {relativeTime(project.savedAt)}</span>
              </button>
              <div className="project-menu-wrap">
                <button className="project-menu-trigger" aria-label={`${project.name} 메뉴`} aria-haspopup="menu" aria-expanded={openMenu === project.id} onClick={() => setOpenMenu(openMenu === project.id ? null : project.id)}><HugeiconsIcon icon={MoreHorizontalIcon} size={20} /></button>
                {openMenu === project.id ? <div className="project-menu" role="menu">
                  <button role="menuitem" onClick={() => { setEditing(project); setName(project.name); setOpenMenu(null); }}>이름 바꾸기</button>
                  <button role="menuitem" onClick={() => { setDeleting(project); setOpenMenu(null); }}>삭제</button>
                </div> : null}
              </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div>
            <p>아직 영상이 없어요.</p>
            <ActionButton variant="neutralWeak" onClick={() => void createProject()}>새 영상 만들기</ActionButton>
          </div>
        </div>
      )}
      {props.status && !codexReady ? <span className="visually-hidden">대본 생성은 Codex 상태를 확인한 뒤 시작할 수 있어요.</span> : null}
      <AlertDialog.Root open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialog.Backdrop /><AlertDialog.Positioner><AlertDialog.Content className="w11-alert-dialog">
          <AlertDialog.Header><AlertDialog.Title>‘{deleting?.name}’을 삭제할까요?</AlertDialog.Title><AlertDialog.Description>원본 복사본, 녹음, 분리한 소리, 자막이 함께 지워져요. 삭제하면 되돌릴 수 없어요.</AlertDialog.Description></AlertDialog.Header>
          <AlertDialog.Footer className="w11-alert-dialog-footer"><ActionButton variant="neutralWeak" onClick={() => setDeleting(null)}>취소</ActionButton><AlertDialog.Action asChild><ActionButton variant="criticalSolid" onClick={() => void deleteProject()}>삭제</ActionButton></AlertDialog.Action></AlertDialog.Footer>
        </AlertDialog.Content></AlertDialog.Positioner>
      </AlertDialog.Root>
      <AlertDialog.Root open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }}>
        <AlertDialog.Backdrop /><AlertDialog.Positioner><AlertDialog.Content className="w11-alert-dialog">
          <AlertDialog.Header><AlertDialog.Title>영상 이름 바꾸기</AlertDialog.Title><AlertDialog.Description>새 이름을 입력해 주세요.</AlertDialog.Description></AlertDialog.Header>
          <input className="rename-input" aria-label="영상 이름" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void renameProject(); }} />
          <AlertDialog.Footer className="w11-alert-dialog-footer"><ActionButton variant="neutralWeak" onClick={() => setEditing(null)}>취소</ActionButton><ActionButton variant="brandSolid" disabled={!name.trim()} onClick={() => void renameProject()}>저장</ActionButton></AlertDialog.Footer>
        </AlertDialog.Content></AlertDialog.Positioner>
      </AlertDialog.Root>
    </section>
  );
}
