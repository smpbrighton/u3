import type { RenderTimeline } from "../../core/timeline/to-render";
import type { U3ShortProps } from "../../remotion/types";
import type { Project } from "../../core/schema";

export function speedSourceMatches(project: Pick<Project, "id" | "inputs" | "timeline">, expected: { projectId: string; sourceId: string; file: string }): boolean {
  const file = project.inputs.find(input => input.id === expected.sourceId)?.file
    ?? project.timeline.voice.find(clip => clip.file === expected.sourceId)?.file;
  return project.id === expected.projectId && file === expected.file;
}

export type PreviewSources = Pick<U3ShortProps, "inputs" | "overlayInputs" | "memes"> & {
  files: Record<string, string>;
};

export function hasAllRenderSources(render: RenderTimeline, sources: PreviewSources): boolean {
  const hasVideoSources = render.video.every((sequence) => sequence.kind === "meme"
    ? Boolean(sources.memes[sequence.memeId!])
    : Boolean(sources.inputs[sequence.inputId!]));
  if (!hasVideoSources) return false;

  const hasOverlaySources = render.overlay.every((clip) => clip.kind === "meme"
    ? Boolean(sources.memes[clip.memeId!])
    : Boolean(sources.overlayInputs[clip.inputId!]));
  if (!hasOverlaySources) return false;

  return render.audio.every((layer) => {
    if (layer.file) return Boolean(sources.files[layer.file] || layer.file.startsWith("http"));
    if (layer.track === "source" || layer.track === "stem-voice" || layer.track === "stem-bg") {
      return Boolean(sources.inputs[layer.inputId!]);
    }
    if (layer.track === "meme") return Boolean(sources.memes[layer.inputId!]);
    if (!layer.file) return false;
    return Boolean(sources.files[layer.file] || layer.file.startsWith("http"));
  });
}
