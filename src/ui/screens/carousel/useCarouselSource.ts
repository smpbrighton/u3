import { useEffect, useState } from "react";
import type { Carousel } from "../../../core/carousel";
import type { CodexScript, Project } from "../../../core/schema";
import { nearestScriptFrame, sourceAtTimelineSec } from "../../../core/carousel-frame";
import { api } from "../../api";

type FrameGroup = { inputId: string; frames: { file: string; url: string; sec: number }[] };
export function useCarouselSource(source: Carousel["source"]) {
  const [project, setProject] = useState<Project | null>(null);
  const [script, setScript] = useState<CodexScript | null>(null);
  const [frames, setFrames] = useState<FrameGroup[]>([]);
  const id = source.kind === "project" ? source.projectId : null;
  useEffect(() => {
    setProject(null); setScript(null); setFrames([]);
    if (!id) return;
    let live = true;
    void Promise.allSettled([
      api<Project>("GET", `/api/projects/${encodeURIComponent(id)}`),
      api<CodexScript | null>("GET", `/api/projects/${encodeURIComponent(id)}/script`),
      api<FrameGroup[]>("GET", `/api/projects/${encodeURIComponent(id)}/frames/list`),
    ]).then(([p, s, f]) => {
      if (!live) return;
      if (p.status === "fulfilled") setProject(p.value);
      if (s.status === "fulfilled") setScript(s.value);
      if (f.status === "fulfilled") setFrames(f.value);
    });
    return () => { live = false; };
  }, [id]);
  function thumbnail(sec: number) {
    if (!project) return "";
    const at = sourceAtTimelineSec(project.timeline, sec);
    if (!at) return "";
    const candidates = frames.find(group => group.inputId === at.clip.inputId)?.frames ?? [];
    const nearest = nearestScriptFrame(candidates.map(frame => frame.sec), at.sourceSec);
    return candidates.find(frame => frame.sec === nearest)?.url ?? "";
  }
  return { project, script, thumbnail };
}
